"use client";

import { useEffect, useState } from "react";
import { Button, InlineNotice } from "../../../components/ui";
import { apiFetch } from "../../../lib/client";
import { MissionTestPanel } from "./mission-test-panel";

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function SettingsPanel({ missionTestAvailable }: { missionTestAvailable: boolean }) {
  const [message, setMessage] = useState("");
  const [secretTaps, setSecretTaps] = useState(0);
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    if (missionTestAvailable && new URLSearchParams(window.location.search).get("missionTest") === "return") setTestOpen(true);
  }, [missionTestAvailable]);

  async function enablePush() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error();
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMessage("알림 권한이 허용되지 않았어요."); return; }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const { publicKey } = await apiFetch<{ publicKey: string }>("/api/push/key");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(publicKey) });
      await apiFetch("/api/push/subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
      setMessage("이제 데이트 중 작은 미션을 받을 수 있어요.");
    } catch {
      setMessage("알림을 켜지 못했어요. 브라우저 설정을 확인해 주세요.");
    }
  }

  function tapVersion() {
    if (!missionTestAvailable) return;
    const next = secretTaps + 1;
    if (next >= 7) { setTestOpen(true); setSecretTaps(0); }
    else setSecretTaps(next);
  }

  return <>
    <div className="settings-stack">
      <section className="settings-note settings-notification"><span className="note-number" aria-hidden="true">01</span><div><h2>작은 미션 알림</h2><p className="muted">예정된 데이트 중 한 번, 예상하지 못한 순간에만 알려드려요.</p></div><div className="settings-actions"><Button variant="secondary" onClick={() => void enablePush()}>알림 켜기</Button><Button variant="quiet" onClick={async () => { try { await apiFetch("/api/push/test", { method: "POST" }); setMessage("테스트 알림을 보냈어요."); } catch { setMessage("알림을 보내지 못했어요."); } }}>테스트 알림</Button></div></section>
      <section className="settings-note settings-install"><span className="note-number" aria-hidden="true">02</span><div><h2>앱으로 사용하기</h2><p className="muted">iPhone은 Safari에서 홈 화면에 추가한 뒤 알림을 받을 수 있어요.</p></div></section>
      <section className="settings-note settings-logout"><span className="note-number" aria-hidden="true">03</span><div><h2>로그아웃</h2><p className="muted">이 기기의 기억 상자를 닫습니다.</p></div><Button variant="danger" size="small" onClick={async () => { await apiFetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }}>로그아웃</Button></section>
    </div>
    {message && <div className="settings-message"><InlineNotice>{message}</InlineNotice></div>}
    <button className={`version-stamp ${missionTestAvailable ? "secret-enabled" : ""}`} onClick={tapVersion} aria-label={missionTestAvailable ? "버전 정보" : undefined}><span aria-hidden="true">✦</span> 그대로 멈춰라. · private 02</button>
    {testOpen && missionTestAvailable && <MissionTestPanel />}
  </>;
}
