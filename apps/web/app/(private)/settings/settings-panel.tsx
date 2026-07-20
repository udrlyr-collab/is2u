"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, InlineNotice, Input, StatusSticker } from "../../../components/ui";
import { normalizeMissionIntervalInputs } from "@is2u/core/mission-interval";
import { apiFetch } from "../../../lib/client";
import { appVersionLabel, normalizeAppVersion } from "../../../lib/app-version";
import { ConnectionPanel } from "./connection-panel";
import { AccountPanel } from "./account-panel";
import { SettingsNote } from "./settings-note";

type PushState = "checking" | "unsupported" | "blocked" | "permission-needed" | "subscription-missing" | "active";

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

const pushCopy: Record<PushState, { title: string; detail: string; tone: "neutral" | "active" | "done" | "expired" }> = {
  checking: { title: "알림 상태를 확인하고 있어요", detail: "잠시만 기다려주세요", tone: "neutral" },
  unsupported: { title: "이 브라우저에서는 알림을 사용할 수 없어요", detail: "Safari에서 사이트를 앱으로 추가하거나 지원되는 브라우저에서 다시 확인해주세요", tone: "expired" },
  blocked: { title: "알림이 꺼져 있어요", detail: "브라우저 설정에서 알림 권한을 허용해주세요", tone: "expired" },
  "permission-needed": { title: "알림이 꺼져 있어요", detail: "미션을 놓치지 않으려면 알림을 켜주세요", tone: "neutral" },
  "subscription-missing": { title: "알림 연결이 필요해요", detail: "권한은 켜져 있지만 이 기기의 알림 연결이 아직 없어요", tone: "active" },
  active: { title: "알림이 켜져 있어요", detail: "미션이 도착하면 알려드릴게요", tone: "done" },
};

export function SettingsPanel() {
  const [message, setMessage] = useState("");
  const [pushState, setPushState] = useState<PushState>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushHelpOpen, setPushHelpOpen] = useState(false);
  const [intervalMin, setIntervalMin] = useState("40");
  const [intervalMax, setIntervalMax] = useState("90");
  const [intervalStatus, setIntervalStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [connected, setConnected] = useState<boolean | null>(null);
  const savedInterval = useRef({ min: 40, max: 90 });
  const intervalSaveTimer = useRef<number | null>(null);
  const intervalSaveVersion = useRef(0);

  const refreshPushState = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { setPushState("unsupported"); return; }
    if (Notification.permission === "denied") { setPushState("blocked"); return; }
    if (Notification.permission !== "granted") { setPushState("permission-needed"); return; }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setPushState(subscription ? "active" : "subscription-missing");
    } catch { setPushState("subscription-missing"); }
  }, []);

  useEffect(() => {
    void refreshPushState();
  }, [refreshPushState]);

  useEffect(() => {
    if (!connected) return;
    void apiFetch<{ minMinutes: number; maxMinutes: number }>("/api/settings/couple").then((settings) => {
      savedInterval.current = { min: settings.minMinutes, max: settings.maxMinutes };
      setIntervalMin(String(settings.minMinutes));
      setIntervalMax(String(settings.maxMinutes));
    }).catch(() => setMessage("랜덤 미션 간격을 불러오지 못했어요"));
  }, [connected]);

  useEffect(() => () => {
    if (intervalSaveTimer.current !== null) window.clearTimeout(intervalSaveTimer.current);
  }, []);

  async function enablePush() {
    setPushBusy(true);
    setMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error();
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") { await refreshPushState(); setMessage("알림 권한을 허용한 뒤 다시 눌러주세요"); return; }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array((await apiFetch<{ publicKey: string }>("/api/push/key")).publicKey),
      });
      await apiFetch("/api/push/subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      await refreshPushState();
      setMessage("이제 데이트 중 작은 미션이 도착하면 알려드릴게요");
    } catch {
      await refreshPushState();
      setMessage("알림을 켜지 못했어요 브라우저 설정을 확인해주세요");
    } finally { setPushBusy(false); }
  }

  const status = pushCopy[pushState];
  const version = normalizeAppVersion(process.env.NEXT_PUBLIC_APP_VERSION);
  const versionLabel = appVersionLabel(version);
  function scheduleIntervalSave(minMinutes: number, maxMinutes: number) {
    if (minMinutes === savedInterval.current.min && maxMinutes === savedInterval.current.max) {
      setIntervalStatus("saved");
      return;
    }
    if (intervalSaveTimer.current !== null) window.clearTimeout(intervalSaveTimer.current);
    const version = ++intervalSaveVersion.current;
    setIntervalStatus("saving");
    intervalSaveTimer.current = window.setTimeout(async () => {
      try {
        const saved = await apiFetch<{ minMinutes: number; maxMinutes: number }>("/api/settings/couple", {
          method: "PUT",
          body: JSON.stringify({ minMinutes, maxMinutes }),
        });
        if (version !== intervalSaveVersion.current) return;
        savedInterval.current = { min: saved.minMinutes, max: saved.maxMinutes };
        setIntervalMin(String(saved.minMinutes));
        setIntervalMax(String(saved.maxMinutes));
        setIntervalStatus("saved");
        setMessage("랜덤 미션 간격을 바꿨어요");
      } catch {
        if (version !== intervalSaveVersion.current) return;
        setIntervalMin(String(savedInterval.current.min));
        setIntervalMax(String(savedInterval.current.max));
        setIntervalStatus("error");
        setMessage("랜덤 미션 간격을 저장하지 못했어요");
      }
    }, 350);
  }

  function commitInterval(lastChanged: "min" | "max") {
    const { min: minMinutes, max: maxMinutes } = normalizeMissionIntervalInputs(intervalMin, intervalMax, savedInterval.current, lastChanged);
    setIntervalMin(String(minMinutes));
    setIntervalMax(String(maxMinutes));
    scheduleIntervalSave(minMinutes, maxMinutes);
  }

  return <>
    <AccountPanel />
    <ConnectionPanel onConnectionChange={setConnected} />
    <div className="settings-stack">
      <SettingsNote title="작은 미션 알림" description="미션이 도착하면 이 기기로 알려드려요" tone="butter" className="settings-notification">
        <div className="notification-status"><StatusSticker tone={status.tone}>{status.title}</StatusSticker><p className="muted">{status.detail}</p></div>
        <div className="settings-actions">
          {pushState !== "active" && pushState !== "unsupported" && pushState !== "blocked" && <Button variant="secondary" disabled={pushBusy} onClick={() => void enablePush()}>{pushBusy ? "연결하는 중…" : pushState === "subscription-missing" ? "알림 다시 연결" : "알림 켜기"}</Button>}
          {pushState === "active" && <Button variant="quiet" onClick={async () => { try { await apiFetch("/api/push/test", { method: "POST" }); setMessage("알림을 보냈어요"); } catch { setMessage("알림을 보내지 못했어요"); } }}>알림 확인하기</Button>}
          <Button variant="quiet" aria-expanded={pushHelpOpen} aria-controls="notification-help" onClick={() => setPushHelpOpen((open) => !open)}>{pushHelpOpen ? "알림 도움말 닫기" : "알림 도움말"}</Button>
        </div>
        {pushHelpOpen && <div id="notification-help" className="notification-help" role="region" aria-label="휴대전화 알림 켜는 방법">
          <section>
            <span className="notification-help-label">iPhone · Safari</span>
            <h3>홈 화면 앱에서 켜요</h3>
            <ol>
              <li>Safari에서 is2u.today를 열어요</li>
              <li>공유를 누르고 홈 화면에 추가를 골라요</li>
              <li>웹 앱으로 열기를 켠 뒤 추가해요</li>
              <li>홈 화면의 그대로 멈춰라를 열고 이곳에서 알림 켜기를 눌러요</li>
              <li>권한 창에서 허용을 눌러요</li>
            </ol>
            <p>이미 막았다면 iPhone 설정 → 앱 → 그대로 멈춰라 → 알림에서 알림 허용을 켜주세요</p>
            <a href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios" target="_blank" rel="noreferrer">Apple 공식 안내 보기</a>
          </section>
          <section>
            <span className="notification-help-label">Android · Chrome</span>
            <h3>Chrome에서 권한을 허용해요</h3>
            <ol>
              <li>Chrome에서 is2u.today를 열어요</li>
              <li>이곳에서 알림 켜기를 누르고 허용을 골라요</li>
              <li>알림이 막혀 있으면 주소창 왼쪽의 사이트 정보 → 권한 → 알림을 허용으로 바꿔요</li>
              <li>그래도 오지 않으면 Android 설정 → 앱 → Chrome → 알림도 켜져 있는지 확인해요</li>
            </ol>
            <p>설정 메뉴 이름은 휴대전화 제조사와 Android 버전에 따라 조금 다를 수 있어요</p>
            <a href="https://support.google.com/chrome/answer/3220216?co=GENIE.Platform%3DAndroid&amp;hl=ko" target="_blank" rel="noreferrer">Chrome 공식 안내 보기</a>
          </section>
        </div>}
      </SettingsNote>
      {connected && <SettingsNote title="랜덤 미션 간격" description="데이트 중 미션이 찾아오는 간격을 정해요" tone="sky" className="settings-interval">
        <div className="interval-fields">
          <Field label="최소 간격"><Input type="text" inputMode="numeric" maxLength={3} value={intervalMin} onChange={(event) => setIntervalMin(event.target.value)} onBlur={() => commitInterval("min")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitInterval("min"); } }} /></Field>
          <Field label="최대 간격"><Input type="text" inputMode="numeric" maxLength={3} value={intervalMax} onChange={(event) => setIntervalMax(event.target.value)} onBlur={() => commitInterval("max")} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitInterval("max"); } }} /></Field>
        </div>
        <p className={`interval-save-status status-${intervalStatus}`} aria-live="polite">{intervalStatus === "saving" ? "저장 중…" : intervalStatus === "error" ? "저장하지 못했어요" : intervalStatus === "saved" ? "저장됨" : intervalMin && intervalMax ? `${intervalMin}분에서 ${intervalMax}분 사이` : "값을 입력하고 있어요"}</p>
      </SettingsNote>}
      <SettingsNote title="로그아웃" description="이 기기의 기억 상자를 닫아요" tone="rose" className="settings-logout"><Button variant="danger" size="small" onClick={async () => { await apiFetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }}>로그아웃</Button></SettingsNote>
    </div>
    {message && <div className="settings-message"><InlineNotice>{message}</InlineNotice></div>}
    <div className="settings-release-links"><div className="version-stamp" aria-label={version ? `그대로 멈춰라 버전 ${version}` : "그대로 멈춰라"}><span aria-hidden="true">✦</span><strong>그대로 멈춰라</strong>{versionLabel && <small>· {versionLabel}</small>}</div><nav aria-label="서비스 안내"><Link href="/design">Design</Link><Link href="/history">History</Link></nav></div>
  </>;
}
