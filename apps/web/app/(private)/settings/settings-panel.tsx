"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Field, InlineNotice, Input, StatusSticker } from "../../../components/ui";
import { apiFetch } from "../../../lib/client";
import { MissionTestPanel } from "./mission-test-panel";

type PushState = "checking" | "unsupported" | "blocked" | "permission-needed" | "subscription-missing" | "active";

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

const pushCopy: Record<PushState, { title: string; detail: string; tone: "neutral" | "active" | "done" | "expired" }> = {
  checking: { title: "알림 상태를 확인하고 있어요", detail: "잠시만 기다려주세요", tone: "neutral" },
  unsupported: { title: "이 브라우저에서는 알림을 사용할 수 없어요", detail: "홈 화면에 추가한 Safari 또는 지원되는 브라우저에서 다시 확인해주세요", tone: "expired" },
  blocked: { title: "알림이 꺼져 있어요", detail: "브라우저 설정에서 알림 권한을 허용해주세요", tone: "expired" },
  "permission-needed": { title: "알림이 꺼져 있어요", detail: "미션을 놓치지 않으려면 알림을 켜주세요", tone: "neutral" },
  "subscription-missing": { title: "알림 연결이 필요해요", detail: "권한은 켜져 있지만 이 기기의 알림 연결이 아직 없어요", tone: "active" },
  active: { title: "알림이 켜져 있어요", detail: "미션이 도착하면 알려드릴게요", tone: "done" },
};

export function SettingsPanel({ missionTestAvailable }: { missionTestAvailable: boolean }) {
  const [message, setMessage] = useState("");
  const [secretTaps, setSecretTaps] = useState(0);
  const [testOpen, setTestOpen] = useState(false);
  const [pushState, setPushState] = useState<PushState>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [intervalMin, setIntervalMin] = useState(40);
  const [intervalMax, setIntervalMax] = useState(90);
  const [intervalBusy, setIntervalBusy] = useState(false);

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
    void apiFetch<{ minMinutes: number; maxMinutes: number }>("/api/settings/couple").then((settings) => {
      setIntervalMin(settings.minMinutes);
      setIntervalMax(settings.maxMinutes);
    }).catch(() => setMessage("랜덤 미션 간격을 불러오지 못했어요"));
    if (missionTestAvailable && new URLSearchParams(window.location.search).get("missionTest") === "return") setTestOpen(true);
  }, [missionTestAvailable, refreshPushState]);

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

  function tapVersion() {
    if (!missionTestAvailable) return;
    const next = secretTaps + 1;
    if (next >= 3) { setTestOpen(true); setSecretTaps(0); }
    else setSecretTaps(next);
  }

  const status = pushCopy[pushState];
  async function saveInterval() {
    if (intervalMin > intervalMax) { setMessage("최소 간격은 최대 간격보다 클 수 없어요"); return; }
    setIntervalBusy(true);
    setMessage("");
    try {
      const saved = await apiFetch<{ minMinutes: number; maxMinutes: number }>("/api/settings/couple", {
        method: "PUT",
        body: JSON.stringify({ minMinutes: intervalMin, maxMinutes: intervalMax }),
      });
      setIntervalMin(saved.minMinutes);
      setIntervalMax(saved.maxMinutes);
      setMessage("랜덤 미션 간격을 저장했어요");
    } catch { setMessage("랜덤 미션 간격을 저장하지 못했어요"); }
    finally { setIntervalBusy(false); }
  }

  return <>
    <div className="settings-stack">
      <section className="settings-note settings-notification"><div><h2>작은 미션 알림</h2><div className="notification-status"><StatusSticker tone={status.tone}>{status.title}</StatusSticker><p className="muted">{status.detail}</p></div></div><div className="settings-actions">{pushState !== "active" && pushState !== "unsupported" && pushState !== "blocked" && <Button variant="secondary" disabled={pushBusy} onClick={() => void enablePush()}>{pushBusy ? "연결하는 중…" : pushState === "subscription-missing" ? "알림 다시 연결" : "알림 켜기"}</Button>}{pushState === "active" && <Button variant="quiet" onClick={async () => { try { await apiFetch("/api/push/test", { method: "POST" }); setMessage("알림을 보냈어요"); } catch { setMessage("알림을 보내지 못했어요"); } }}>알림 확인하기</Button>}</div></section>
      <section className="settings-note settings-interval"><div><h2>랜덤 미션 간격</h2><p className="muted">데이트 중 미션이 도착하는 간격을 정해요</p><div className="interval-fields"><Field label="최소 간격"><Input type="number" min={20} max={240} value={intervalMin} onChange={(event) => setIntervalMin(Number(event.target.value))} /></Field><Field label="최대 간격"><Input type="number" min={20} max={240} value={intervalMax} onChange={(event) => setIntervalMax(Number(event.target.value))} /></Field></div><p className="field-hint">20분부터 240분 사이에서 정할 수 있어요</p></div><Button variant="secondary" size="small" disabled={intervalBusy} onClick={() => void saveInterval()}>{intervalBusy ? "저장하고 있어요…" : "간격 저장하기"}</Button></section>
      <section className="settings-note settings-logout"><div><h2>로그아웃</h2><p className="muted">이 기기의 기억 상자를 닫아요</p></div><Button variant="danger" size="small" onClick={async () => { await apiFetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }}>로그아웃</Button></section>
    </div>
    {message && <div className="settings-message"><InlineNotice>{message}</InlineNotice></div>}
    <button className={`version-stamp ${missionTestAvailable ? "secret-enabled" : ""}`} onClick={tapVersion} aria-label={missionTestAvailable ? "버전 정보" : undefined}><span aria-hidden="true">✦</span> 그대로 멈춰라 · private</button>
    {testOpen && missionTestAvailable && <MissionTestPanel />}
  </>;
}
