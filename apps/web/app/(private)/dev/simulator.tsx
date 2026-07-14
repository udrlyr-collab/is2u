"use client";

import { useEffect, useState } from "react";
import { MISSION_TYPES } from "@is2u/core/types";
import { apiFetch } from "../../../lib/client";

export function DevSimulator() {
  const [state, setState] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState("");
  const refresh = async () => setState(await apiFetch<Record<string, unknown>>("/api/dev/simulate"));
  useEffect(() => { void refresh(); }, []);
  async function action(body: object) { try { await apiFetch("/api/dev/simulate", { method: "POST", body: JSON.stringify(body) }); setMessage("완료"); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "실패"); } }
  return <div className="settings-stack">
    <button className="secondary-button" onClick={() => void action({ action: "create-active-date" })}>지금 활성 일정 만들기</button>
    <div className="emotion-grid">{MISSION_TYPES.map((type) => <button key={type} onClick={() => void action({ action: "force-mission", missionType: type })}>{type} 미션</button>)}</div>
    <button className="secondary-button" onClick={() => void action({ action: "advance", minutes: 30 })}>시간 30분 진행</button>
    <button className="text-button danger" onClick={() => void action({ action: "reset" })}>테스트 데이터 초기화</button>
    {message && <p className="notice">{message}</p>}
    <pre style={{ overflow: "auto", fontSize: ".72rem" }}>{JSON.stringify(state, null, 2)}</pre>
  </div>;
}
