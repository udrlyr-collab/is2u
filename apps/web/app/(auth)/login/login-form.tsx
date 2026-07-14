"use client";

import { FormEvent, useState } from "react";
import { Button, InlineNotice } from "../../../components/ui";
import { apiFetch } from "../../../lib/client";

export function LoginForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || pin.length !== 4) return;
    setError("");
    setBusy(true);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ pin }) });
      window.location.assign("/home");
    } catch {
      setError("PIN을 확인하거나 잠시 뒤 다시 시도해 주세요.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="pin-form">
    <label className="visually-hidden" htmlFor="pin">네 자리 PIN</label>
    <div className="pin-entry">
      {[0, 1, 2, 3].map((index) => <span className="pin-cell" aria-hidden="true" key={index}>{pin[index] ? "●" : ""}</span>)}
      <input
        id="pin"
        name="pin"
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        autoComplete="current-password"
        pattern="\d{4}"
        maxLength={4}
        className="pin-input"
        aria-describedby={error ? "login-error" : undefined}
        autoFocus
      />
    </div>
    {error && <InlineNotice tone="error"><span id="login-error">{error}</span></InlineNotice>}
    <Button className="pin-submit" disabled={busy || pin.length !== 4}>{busy ? "상자를 열고 있어요…" : "상자 열기"}</Button>
  </form>;
}
