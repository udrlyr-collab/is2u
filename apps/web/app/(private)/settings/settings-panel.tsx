"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, InlineNotice, StatusSticker } from "../../../components/ui";
import { usePaperSoundSetting } from "../../../components/paper-sound-provider";
import { apiFetch } from "../../../lib/client";
import { MissionTestPanel } from "./mission-test-panel";

type PushState = "checking" | "unsupported" | "blocked" | "permission-needed" | "subscription-missing" | "active";

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

const pushCopy: Record<PushState, { title: string; detail: string; tone: "neutral" | "active" | "done" | "expired" }> = {
  checking: { title: "알림 상태를 확인하고 있어요", detail: "잠시만 기다려주세요.", tone: "neutral" },
  unsupported: { title: "이 브라우저에서는 알림을 사용할 수 없어요", detail: "홈 화면에 추가한 Safari 또는 지원되는 브라우저에서 다시 확인해주세요.", tone: "expired" },
  blocked: { title: "알림이 꺼져 있어요", detail: "브라우저 설정에서 알림 권한을 허용해주세요.", tone: "expired" },
  "permission-needed": { title: "알림이 꺼져 있어요", detail: "미션을 놓치지 않으려면 알림을 켜주세요.", tone: "neutral" },
  "subscription-missing": { title: "알림 연결이 필요해요", detail: "권한은 켜져 있지만 이 기기의 알림 연결이 아직 없어요.", tone: "active" },
  active: { title: "알림이 켜져 있어요", detail: "미션이 도착하면 알려드릴게요.", tone: "done" },
};

export function SettingsPanel({ missionTestAvailable }: { missionTestAvailable: boolean }) {
  const [message, setMessage] = useState("");
  const [secretTaps, setSecretTaps] = useState(0);
  const [testOpen, setTestOpen] = useState(false);
  const [pushState, setPushState] = useState<PushState>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const { enabled: paperSoundEnabled, setEnabled: setPaperSoundEnabled, play } = usePaperSoundSetting();

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
    if (missionTestAvailable && new URLSearchParams(window.location.search).get("missionTest") === "return") setTestOpen(true);
  }, [missionTestAvailable, refreshPushState]);

  async function enablePush() {
    setPushBusy(true);
    setMessage("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error();
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") { await refreshPushState(); setMessage("알림 권한을 허용한 뒤 다시 눌러주세요."); return; }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array((await apiFetch<{ publicKey: string }>("/api/push/key")).publicKey),
      });
      await apiFetch("/api/push/subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      await refreshPushState();
      setMessage("이제 데이트 중 작은 미션이 도착하면 알려드릴게요.");
    } catch {
      await refreshPushState();
      setMessage("알림을 켜지 못했어요. 브라우저 설정을 확인해주세요.");
    } finally { setPushBusy(false); }
  }

  function tapVersion() {
    if (!missionTestAvailable) return;
    const next = secretTaps + 1;
    if (next >= 3) { setTestOpen(true); setSecretTaps(0); }
    else setSecretTaps(next);
  }

  const status = pushCopy[pushState];
  return <>
    <div className="settings-stack">
      <section className="settings-note settings-notification"><div><h2>작은 미션 알림</h2><div className="notification-status"><StatusSticker tone={status.tone}>{status.title}</StatusSticker><p className="muted">{status.detail}</p></div></div><div className="settings-actions">{pushState !== "active" && pushState !== "unsupported" && pushState !== "blocked" && <Button variant="secondary" disabled={pushBusy} data-paper-sound="note-stick" onClick={() => void enablePush()}>{pushBusy ? "연결하는 중…" : pushState === "subscription-missing" ? "알림 다시 연결" : "알림 켜기"}</Button>}{pushState === "active" && <Button variant="quiet" onClick={async () => { try { await apiFetch("/api/push/test", { method: "POST" }); setMessage("테스트 알림을 보냈어요."); } catch { setMessage("알림을 보내지 못했어요."); } }}>테스트 알림</Button>}</div></section>
      <section className="settings-note settings-sound"><div><h2>종이 소리</h2><p className="muted">메모를 붙이고 펼칠 때 작은 종이 소리를 들려드려요.</p></div><div className="settings-actions"><Button variant="quiet" disabled={!paperSoundEnabled} onClick={() => play("paper-tap")}>종이 소리 들어보기</Button><Button variant={paperSoundEnabled ? "secondary" : "quiet"} aria-pressed={paperSoundEnabled} data-paper-sound="note-stick" onClick={() => setPaperSoundEnabled(!paperSoundEnabled)}>{paperSoundEnabled ? "켜짐" : "꺼짐"}</Button></div></section>
      <section className="settings-note settings-install"><div><h2>앱으로 사용하기</h2><p className="muted">iPhone은 Safari에서 홈 화면에 추가한 뒤 알림을 받을 수 있어요.</p></div></section>
      <section className="settings-note settings-logout"><div><h2>로그아웃</h2><p className="muted">이 기기의 기억 상자를 닫습니다.</p></div><Button variant="danger" size="small" onClick={async () => { await apiFetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }}>로그아웃</Button></section>
    </div>
    {message && <div className="settings-message"><InlineNotice>{message}</InlineNotice></div>}
    <button className={`version-stamp ${missionTestAvailable ? "secret-enabled" : ""}`} onClick={tapVersion} aria-label={missionTestAvailable ? "버전 정보" : undefined}><span aria-hidden="true">✦</span> 그대로 멈춰라 · private</button>
    {testOpen && missionTestAvailable && <MissionTestPanel />}
  </>;
}
