"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { seoulDayKey } from "@is2u/core/dates";
import { memoryDisplayTitle, userFacingSentence, type MemoryType } from "@is2u/core/types";
import { InlineNotice, StatusSticker } from "../../../components/ui";
import { apiFetch } from "../../../lib/client";
import { ManualMemoryComposer } from "./manual-memory-composer";

type Asset = { id: string; role: "preview" | "thumbnail" | "poster"; mimeType: string; processingStatus: string };
type Memory = { id: string; type: MemoryType; customTitle: string | null; text: string | null; emotion: string | null; createdAt: string; firstPinnedAt: string; updatedAt: string; assets: Asset[] };
type Person = { id: string; displayName: string; roleLabel: string };
type Entry = {
  id: string;
  kind: "mission" | "manual";
  type: MemoryType;
  status: "scheduled" | "sent" | "completed" | "skipped" | "expired" | "cancelled";
  isTest: boolean;
  source: string;
  scheduledAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  displayAt: string;
  recipient: Person;
  dateEvent: { id: string; title: string | null; startAt: string; endAt: string; status: string; deletedAt: string | null } | null;
  copy: { title: string; prompt: string } | null;
  canOpen: boolean;
  memory: Memory | null;
};
type Payload = { currentUserId: string; recipients: Person[]; entries: Entry[] };

const dayFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" });
const timeFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
const statusCopy = {
  scheduled: { label: "기다리는 중", tone: "neutral" },
  sent: { label: "지금 해야 해요", tone: "active" },
  completed: { label: "보관 완료", tone: "done" },
  skipped: { label: "그냥 지나감", tone: "neutral" },
  expired: { label: "시간이 지남", tone: "expired" },
  cancelled: { label: "취소", tone: "cancelled" },
} as const;

function pickPreview(entry: Entry): Asset | undefined {
  const ready = entry.memory?.assets.filter((asset) => asset.processingStatus === "ready") ?? [];
  if (entry.type === "photo") return ready.find((asset) => asset.role === "thumbnail") ?? ready.find((asset) => asset.role === "preview");
  if (entry.type === "video" || entry.type === "manual_video") return ready.find((asset) => asset.role === "poster") ?? ready.find((asset) => asset.role === "thumbnail");
  if (entry.type === "audio") return ready.find((asset) => asset.role === "preview");
  return undefined;
}

function EntryPreview({ entry, url }: { entry: Entry; url?: string }) {
  if (entry.memory?.type === "text") return <blockquote className="mission-text-preview">“{entry.memory.text}”</blockquote>;
  if (entry.memory?.type === "emotion") return <div className="mission-emotion-preview"><span aria-hidden="true">✦</span>{entry.memory.emotion}</div>;
  if (entry.type === "photo" || entry.type === "video" || entry.type === "manual_video") return url
    ? <div className={`mission-media-preview preview-${entry.type === "photo" ? "photo" : "video"}`}><img src={url} alt={entry.type === "photo" ? "사진 추억 미리보기" : "영상 추억 포스터"} />{entry.type !== "photo" && <span className="video-mark" aria-hidden="true">▶</span>}</div>
    : <div className="mission-placeholder"><span aria-hidden="true">▧</span>{entry.memory ? "미리보기를 준비하고 있어요" : userFacingSentence(entry.copy?.prompt ?? "")}</div>;
  if (entry.type === "audio") return <div className="audio-preview"><span className="wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span><small>{url ? "펼쳐서 목소리 듣기" : entry.memory ? "목소리를 준비하고 있어요" : userFacingSentence(entry.copy?.prompt ?? "")}</small></div>;
  return <p className="mission-prompt-preview">{userFacingSentence(entry.copy?.prompt ?? "")}</p>;
}

function MemorySlip({ entry, url, index }: { entry: Entry; url?: string; index: number }) {
  const status = statusCopy[entry.status];
  const role = entry.recipient.roleLabel === "남자친구" ? "boyfriend" : "girlfriend";
  const title = memoryDisplayTitle({ type: entry.memory?.type ?? entry.type, customTitle: entry.memory?.customTitle, missionTitle: entry.copy?.title });
  const personLabel = entry.kind === "mission" ? `${entry.recipient.roleLabel}에게 온 미션` : `${entry.recipient.displayName} · ${entry.recipient.roleLabel}`;
  const appointmentTitle = !entry.isTest && entry.source !== "manual_random" && !entry.dateEvent?.deletedAt ? entry.dateEvent?.title : null;
  const body = <article className={`mission-slip slip-${entry.status} slip-${index % 3} person-${role}`}>
    <span className="slip-tape" aria-hidden="true" />
    <header><h3>{title}</h3><StatusSticker tone={status.tone}>{status.label}</StatusSticker></header>
    <EntryPreview entry={entry} url={url} />
    <div className="memory-card-meta"><span>{timeFormatter.format(new Date(entry.memory?.firstPinnedAt ?? entry.displayAt))}</span><span className={`recipient-name-tag recipient-${role}`}>{personLabel}</span></div>
    <footer>{appointmentTitle && <span>{appointmentTitle}</span>}{entry.canOpen && <strong>{entry.status === "completed" ? "자세히 보기 →" : "쪽지 열기 →"}</strong>}</footer>
  </article>;
  if (!entry.canOpen) return body;
  return <Link href={entry.kind === "manual" ? `/memories/${entry.id}` : `/missions/${entry.id}`} className="mission-slip-link">{body}</Link>;
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
      const candidates = result.entries.map((entry) => pickPreview(entry)).filter((asset): asset is Asset => Boolean(asset));
      const signed = await Promise.all(candidates.map(async (asset) => {
        try { return [asset.id, (await apiFetch<{ url: string }>(`/api/media/${asset.id}/access`, { method: "POST" })).url] as const; }
        catch { return null; }
      }));
      setUrls(Object.fromEntries(signed.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } catch { setError("추억을 불러오지 못했어요 잠시 뒤 다시 펼쳐주세요"); }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  if (!payload && !error) return <div className="board-loading"><span aria-hidden="true" />추억을 꺼내고 있어요…</div>;

  return <div className="mission-board">
    <header className="home-intro"><div><p className="paper-label">OUR LITTLE MEMORIES</p><h1>우리의 추억</h1></div><ManualMemoryComposer onSaved={() => void load()} /></header>
    {error && <InlineNotice tone="error">{error}</InlineNotice>}
    {payload && payload.entries.length === 0 && <section className="empty-board"><span className="empty-tape" aria-hidden="true" /><h2>아직 붙여둔 추억이 없어요</h2><p>추억을 직접 남기거나 약속 중 도착한 미션을 열어보세요</p></section>}
    {payload && <section className="unified-timeline">{[...new Set(payload.entries.map((entry) => seoulDayKey(entry.displayAt)))].map((day) => {
      const dayEntries = payload.entries.filter((entry) => seoulDayKey(entry.displayAt) === day);
      const appointmentTitles = [...new Set(dayEntries.flatMap((entry) => {
        if (entry.isTest || entry.source === "manual_random" || entry.dateEvent?.deletedAt || !entry.dateEvent?.title) return [];
        return [entry.dateEvent.title];
      }))];
      return <div className="mission-day" key={day}>
        <h2 className="day-divider"><span>{dayFormatter.format(new Date(dayEntries[0].displayAt))}</span>{appointmentTitles.length > 0 && <span className="day-appointment-stickers">{appointmentTitles.map((title) => <b key={title}>{title}</b>)}</span>}<i aria-hidden="true" /></h2>
        <div className="mission-slips">{dayEntries.map((entry, index) => { const preview = pickPreview(entry); return <MemorySlip key={`${entry.kind}-${entry.id}`} entry={entry} url={preview ? urls[preview.id] : undefined} index={index} />; })}</div>
      </div>;
    })}</section>}
  </div>;
}
