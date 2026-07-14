"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { seoulDayKey } from "@is2u/core/dates";
import { InlineNotice, StatusSticker } from "../../../components/ui";
import { apiFetch } from "../../../lib/client";

type Asset = { id: string; role: "preview" | "thumbnail" | "poster"; mimeType: string; processingStatus: string };
type Memory = { id: string; type: string; text: string | null; emotion: string | null; createdAt: string; assets: Asset[] };
type Recipient = { id: string; displayName: string; roleLabel: string };
type Mission = {
  id: string;
  type: "audio" | "photo" | "video" | "text" | "emotion";
  status: "scheduled" | "sent" | "completed" | "skipped" | "expired" | "cancelled";
  isTest: boolean;
  scheduledAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  displayAt: string;
  recipient: Recipient;
  dateEvent: { id: string; title: string | null; startAt: string; endAt: string; status: string };
  copy: { title: string; prompt: string };
  canOpen: boolean;
  memory: Memory | null;
};
type Payload = { currentUserId: string; recipients: Recipient[]; missions: Mission[] };

const dayFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
const statusCopy = {
  scheduled: { label: "기다리는 중", tone: "neutral" },
  sent: { label: "지금 해야 해요", tone: "active" },
  completed: { label: "보관 완료", tone: "done" },
  skipped: { label: "그냥 지나감", tone: "neutral" },
  expired: { label: "시간이 지남", tone: "expired" },
  cancelled: { label: "취소", tone: "cancelled" },
} as const;

function pickPreview(mission: Mission): Asset | undefined {
  const ready = mission.memory?.assets.filter((asset) => asset.processingStatus === "ready") ?? [];
  if (mission.type === "photo") return ready.find((asset) => asset.role === "thumbnail") ?? ready.find((asset) => asset.role === "preview");
  if (mission.type === "video") return ready.find((asset) => asset.role === "poster") ?? ready.find((asset) => asset.role === "thumbnail");
  if (mission.type === "audio") return ready.find((asset) => asset.role === "preview");
  return undefined;
}

function MissionPreview({ mission, url }: { mission: Mission; url?: string }) {
  if (mission.memory?.type === "text") return <blockquote className="mission-text-preview">“{mission.memory.text}”</blockquote>;
  if (mission.memory?.type === "emotion") return <div className="mission-emotion-preview"><span aria-hidden="true">✦</span>{mission.memory.emotion}</div>;
  if (mission.type === "photo" || mission.type === "video") return url
    ? <div className={`mission-media-preview preview-${mission.type}`}><img src={url} alt={mission.type === "photo" ? "사진 미션 미리보기" : "영상 미션 포스터"} />{mission.type === "video" && <span className="video-mark" aria-hidden="true">▶</span>}</div>
    : <div className="mission-placeholder"><span aria-hidden="true">▧</span>{mission.memory ? "미리보기 준비 중" : mission.copy.prompt}</div>;
  if (mission.type === "audio") return <div className="audio-preview"><span className="wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span><small>{url ? "펼쳐서 소리 듣기" : mission.memory ? "소리를 준비하고 있어요" : mission.copy.prompt}</small></div>;
  return <p className="mission-prompt-preview">{mission.copy.prompt}</p>;
}

function MissionSlip({ mission, url, index }: { mission: Mission; url?: string; index: number }) {
  const status = statusCopy[mission.status];
  const body = <article className={`mission-slip slip-${mission.status} slip-${index % 3}`}>
    <span className="slip-tape" aria-hidden="true" />
    <header>
      <div><p className="mission-time">{timeFormatter.format(new Date(mission.displayAt))}</p><h3>{mission.copy.title}</h3></div>
      <div className="sticker-row"><span className={`recipient-name-tag recipient-${mission.recipient.roleLabel === "남자친구" ? "boyfriend" : "girlfriend"}`}>{mission.recipient.roleLabel}에게 온 미션</span>{mission.isTest && <StatusSticker tone="test">TEST</StatusSticker>}<StatusSticker tone={status.tone}>{status.label}</StatusSticker></div>
    </header>
    <MissionPreview mission={mission} url={url} />
    <footer><span>{mission.dateEvent.title || "함께하는 시간"}</span>{mission.canOpen && <strong>{mission.status === "completed" ? "자세히 보기 →" : "쪽지 열기 →"}</strong>}</footer>
  </article>;
  return mission.canOpen ? <Link href={`/missions/${mission.id}`} className="mission-slip-link">{body}</Link> : body;
}

export function MissionBoard() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<Payload>("/api/missions");
      setPayload(result);
      setError("");
      const candidates = result.missions.map((mission) => pickPreview(mission)).filter((asset): asset is Asset => Boolean(asset));
      const signed = await Promise.all(candidates.map(async (asset) => {
        try { return [asset.id, (await apiFetch<{ url: string }>(`/api/media/${asset.id}/access`, { method: "POST" })).url] as const; }
        catch { return null; }
      }));
      setUrls(Object.fromEntries(signed.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } catch {
      setError("미션 쪽지를 불러오지 못했어요. 잠시 뒤 다시 펼쳐주세요.");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  if (!payload && !error) return <div className="board-loading"><span aria-hidden="true" />미션 쪽지를 꺼내고 있어요…</div>;

  return <div className="mission-board">
    <header className="home-intro"><p className="paper-label">OUR LITTLE MOMENTS</p><h1>우리의 순간</h1><p>도착한 쪽지와 둘이 남긴 순간을 시간순으로 붙여두었어요.</p></header>
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {payload && payload.missions.length === 0 && <section className="empty-board"><span className="empty-tape" aria-hidden="true" /><h2>아직 도착한 쪽지가 없어요.</h2><p>약속한 시간이 오면 여기에 작은 미션이 붙어요.</p></section>}
    {payload && <section className="unified-timeline">{[...new Set(payload.missions.map((mission) => seoulDayKey(mission.displayAt)))].map((day) => {
      const dayMissions = payload.missions.filter((mission) => seoulDayKey(mission.displayAt) === day);
      return <div className="mission-day" key={day}>
        <h2 className="day-divider"><span>{dayFormatter.format(new Date(dayMissions[0].displayAt))}</span><i aria-hidden="true" /></h2>
        <div className="mission-slips">{dayMissions.map((mission, index) => { const preview = pickPreview(mission); return <MissionSlip key={mission.id} mission={mission} url={preview ? urls[preview.id] : undefined} index={index} />; })}</div>
      </div>;
    })}</section>}
  </div>;
}
