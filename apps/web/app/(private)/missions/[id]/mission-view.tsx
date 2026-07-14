"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMOTIONS } from "@is2u/core/types";
import { Button, InlineNotice, MissionNote, StatusSticker, Textarea } from "../../../../components/ui";
import { apiFetch } from "../../../../lib/client";
import { uploadFile } from "../../../../lib/upload-client";

type MissionType = "audio" | "photo" | "video" | "text" | "emotion";
type Asset = {
  id: string;
  role: "original" | "preview" | "thumbnail" | "poster";
  mimeType: string;
  fileSize: number;
  originalFilename: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  processingStatus: "pending" | "processing" | "ready" | "failed";
  createdAt: string;
};
type Memory = {
  id: string;
  type: MissionType | "manual_video";
  text: string | null;
  emotion: string | null;
  createdAt: string;
  assets: Asset[];
};
type Mission = {
  id: string;
  type: MissionType;
  status: "scheduled" | "sent" | "completed" | "skipped" | "expired" | "cancelled";
  isTest: boolean;
  scheduledAt: string;
  sentAt: string | null;
  expiresAt: string | null;
  copy: { title: string; prompt: string };
};
type Payload = {
  mission: Mission;
  dateEvent: { id: string; title: string | null; note: string | null; startAt: string; endAt: string };
  recipient: { id: string; displayName: string; roleLabel: string };
  memory: Memory | null;
  originalArchive: Memory[];
};
type Notice = { tone: "info" | "error" | "success"; text: string } | null;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });

function findAsset(memory: Memory | null, role: Asset["role"]): Asset | undefined {
  return memory?.assets.find((asset) => asset.role === role);
}

function Wave() {
  return <span className="wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>;
}

function ProcessingNote({ original, kind }: { original?: Asset; kind: "영상" | "사진" | "소리" }) {
  if (!original || original.processingStatus === "pending" || original.processingStatus === "processing") return <InlineNotice>원본은 보관됐고 {kind === "영상" ? "재생용 영상" : "미리보기"}을 준비하고 있어요.</InlineNotice>;
  if (original.processingStatus === "failed") return <InlineNotice tone="error">{kind} 미리보기를 준비하지 못했어요. 원본은 안전하게 보관되어 있어요.</InlineNotice>;
  return <InlineNotice tone="error">{kind} 미리보기를 아직 불러오지 못했어요.</InlineNotice>;
}

function MemoryMedia({ memory, urls, onZoom, onMediaError }: {
  memory: Memory;
  urls: Record<string, string>;
  onZoom: (url: string) => void;
  onMediaError: (message: string) => void;
}) {
  const original = findAsset(memory, "original");
  const preview = findAsset(memory, "preview");
  const poster = findAsset(memory, "poster");
  const previewUrl = preview ? urls[preview.id] : undefined;
  const posterUrl = poster ? urls[poster.id] : undefined;

  if (memory.type === "photo") return previewUrl
    ? <figure className="detail-photo-paper"><p className="media-kind-label">화면용 preview · 전체 사진</p><button type="button" className="detail-photo-button" onClick={() => onZoom(previewUrl)} aria-label="사진 크게 보기"><img src={previewUrl} alt="완료한 사진 미션" /></button><figcaption>사진을 누르면 더 크게 볼 수 있어요.</figcaption></figure>
    : <ProcessingNote original={original} kind="사진" />;

  if (memory.type === "video" || memory.type === "manual_video") return previewUrl
    ? <div className="detail-video-paper"><p className="media-kind-label">재생용 preview · 원본과 별도</p><video controls playsInline preload="none" poster={posterUrl} onError={() => onMediaError("영상을 아직 불러오지 못했어요. 잠시 후 다시 눌러주세요.")}><source src={previewUrl} type={preview?.mimeType ?? "video/mp4"} />재생할 수 없는 브라우저예요.</video></div>
    : <ProcessingNote original={original} kind="영상" />;

  if (memory.type === "audio") return previewUrl
    ? <div className="detail-audio-paper"><p className="media-kind-label">재생용 소리</p><Wave /><audio controls preload="none" src={previewUrl} onError={() => onMediaError("소리를 아직 불러오지 못했어요.")} /></div>
    : <ProcessingNote original={original} kind="소리" />;

  return null;
}

function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="paper-dialog-backdrop photo-lightbox-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="사진 확대 보기"><button ref={closeRef} type="button" className="lightbox-close" onClick={onClose}>닫기</button><img src={url} alt="완료한 사진 원본 비율 미리보기" /></div>
  </div>;
}

export function MissionView({ id }: { id: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [emotion, setEmotion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [archiveProgress, setArchiveProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<Payload>(`/api/missions/${id}`);
      setPayload(result);
      const derived = [result.memory, ...result.originalArchive]
        .filter((memory): memory is Memory => Boolean(memory))
        .flatMap((memory) => memory.assets)
        .filter((asset) => asset.role !== "original" && asset.processingStatus === "ready");
      const signed = await Promise.all(derived.map(async (asset) => {
        try {
          const access = await apiFetch<{ url: string }>(`/api/media/${asset.id}/access`, { method: "POST" });
          return [asset.id, access.url] as const;
        } catch { return null; }
      }));
      setUrls(Object.fromEntries(signed.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } catch {
      setNotice({ tone: "error", text: "이 미션을 열 수 없어요. 알림을 받은 계정인지 확인해 주세요." });
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const processing = useMemo(() => [payload?.memory, ...(payload?.originalArchive ?? [])]
    .filter((memory): memory is Memory => Boolean(memory))
    .some((memory) => findAsset(memory, "original")?.processingStatus === "pending" || findAsset(memory, "original")?.processingStatus === "processing"), [payload]);

  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => void load(), 4_000);
    return () => window.clearInterval(timer);
  }, [load, processing]);

  async function recordAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setFile(new File(chunks, `moment-${Date.now()}.webm`, { type: mediaRecorder.mimeType || "audio/webm" }));
        setRecordingSeconds(null);
        setNotice({ tone: "success", text: "10초의 소리를 담았어요." });
      };
      mediaRecorder.start();
      setRecordingSeconds(10);
      setNotice({ tone: "info", text: "주변의 소리를 가만히 담고 있어요." });
      const timer = window.setInterval(() => setRecordingSeconds((current) => current === null ? null : Math.max(0, current - 1)), 1000);
      window.setTimeout(() => { window.clearInterval(timer); if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 10_000);
    } catch {
      setNotice({ tone: "error", text: "마이크를 사용할 수 없어요. 브라우저 권한을 확인해 주세요." });
      setRecordingSeconds(null);
    }
  }

  async function complete() {
    const mission = payload?.mission;
    if (!mission || busy) return;
    if (["photo", "video", "audio"].includes(mission.type) && !file) {
      setNotice({ tone: "error", text: "먼저 지금의 순간을 하나 담아주세요." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await apiFetch<{ memory: { id: string } }>(`/api/missions/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({ memoryType: mission.type, text: mission.type === "text" ? text : undefined, emotion: mission.type === "emotion" ? emotion : undefined, idempotencyKey: crypto.randomUUID() }),
      });
      if (file) {
        setProgress(0);
        await uploadFile(result.memory.id, file, setProgress);
      }
      setNotice({ tone: "success", text: "이 순간을 조용히 보관했어요." });
      window.setTimeout(() => window.location.assign("/home"), 900);
    } catch {
      setNotice({ tone: "error", text: "지금은 보관하지 못했어요. 입력한 내용은 두고 잠시 뒤 다시 눌러주세요." });
    } finally { setBusy(false); }
  }

  async function skip() {
    if (!payload?.mission || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/missions/${id}/skip`, { method: "POST" });
      window.location.assign("/home");
    } catch {
      setNotice({ tone: "error", text: "미션 상태를 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요." });
      setBusy(false);
    }
  }

  async function downloadOriginal(memoryId: string) {
    try {
      const result = await apiFetch<{ url: string }>(`/api/memories/${memoryId}/original`, { method: "POST" });
      const link = document.createElement("a");
      link.href = result.url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setNotice({ tone: "error", text: "원본을 내려받지 못했어요. 잠시 후 다시 시도해 주세요." });
    }
  }

  async function storeOriginalVideo(fileToStore: File) {
    if (!payload || busy) return;
    setBusy(true);
    setArchiveProgress(0);
    setNotice(null);
    try {
      const result = await apiFetch<{ memory: { id: string } }>("/api/memories/manual", { method: "POST", body: JSON.stringify({ dateEventId: payload.dateEvent.id, idempotencyKey: crypto.randomUUID() }) });
      await uploadFile(result.memory.id, fileToStore, setArchiveProgress);
      setNotice({ tone: "success", text: "원본을 보관했어요. 재생용 영상을 준비하고 있어요." });
      await load();
    } catch {
      setNotice({ tone: "error", text: "원본 영상을 올리지 못했어요. 같은 파일을 다시 선택하면 이어서 시도해요." });
    } finally { setBusy(false); }
  }

  if (!payload) return <MissionNote><p className="muted">작은 쪽지를 펼치고 있어요…</p>{notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}</MissionNote>;
  const mission = payload.mission;

  if (mission.status === "completed" && payload.memory) {
    const memory = payload.memory;
    const hasOriginal = Boolean(findAsset(memory, "original"));
    return <div className="mission-detail-sheet">
      <span className="detail-sheet-tape" aria-hidden="true" />
      <header className="mission-detail-header"><div><p className="paper-label">{mission.isTest ? "TEST MEMORY" : "MEMORY NOTE"}</p><h1>{mission.copy.title}</h1></div><div className="sticker-row">{mission.isTest && <StatusSticker tone="test">TEST</StatusSticker>}<StatusSticker tone="done">보관 완료</StatusSticker></div></header>
      <dl className="memory-meta"><div><dt>날짜</dt><dd>{dateFormatter.format(new Date(memory.createdAt))}</dd></div><div><dt>시간</dt><dd>{timeFormatter.format(new Date(memory.createdAt))}</dd></div><div><dt>받은 사람</dt><dd>{payload.recipient.displayName} · {payload.recipient.roleLabel}</dd></div></dl>
      <section className="mission-copy-note"><span aria-hidden="true">✦</span><p>{mission.copy.prompt}</p></section>
      {payload.dateEvent.note && <section className="memory-short-note"><h2>함께 적어둔 메모</h2><p>{payload.dateEvent.note}</p></section>}
      {memory.type === "text" && <blockquote className="expanded-text-memory">“{memory.text}”</blockquote>}
      {memory.type === "emotion" && <div className="expanded-emotion-memory"><span aria-hidden="true">✦</span><strong>{memory.emotion}</strong></div>}
      <MemoryMedia memory={memory} urls={urls} onZoom={setZoomUrl} onMediaError={(text) => setNotice({ tone: "error", text })} />
      {hasOriginal && ["photo", "video", "audio"].includes(memory.type) && <div className="original-download-row"><div><strong>원본 파일</strong><small>preview와 별도로 R2에 보관된 파일이에요.</small></div><Button variant="secondary" size="small" onClick={() => void downloadOriginal(memory.id)}>원본 {memory.type === "photo" ? "사진" : memory.type === "video" ? "영상" : "음성"} 저장</Button></div>}
      <section className="original-archive-section"><header><p className="paper-label">ORIGINAL ARCHIVE</p><h2>원본 추가 보관</h2><p>휴대전화에 있는 원본 영상은 그대로 두고, 재생용 preview만 따로 만들어요.</p></header><label className="file-button upload-paper">원본 영상 고르기<input type="file" accept="video/*" hidden disabled={busy} onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void storeOriginalVideo(selected); event.currentTarget.value = ""; }} /></label>{archiveProgress !== null && archiveProgress < 100 && <progress max={100} value={archiveProgress}>{archiveProgress}%</progress>}
        {payload.originalArchive.length > 0 && <div className="archive-list">{payload.originalArchive.map((archive, index) => <article className="archive-paper" key={archive.id}><h3>추가 원본 {payload.originalArchive.length - index}</h3><p>{dateFormatter.format(new Date(archive.createdAt))} · {timeFormatter.format(new Date(archive.createdAt))}</p><MemoryMedia memory={archive} urls={urls} onZoom={setZoomUrl} onMediaError={(text) => setNotice({ tone: "error", text })} /><Button variant="secondary" size="small" onClick={() => void downloadOriginal(archive.id)}>원본 영상 저장</Button></article>)}</div>}
      </section>
      {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
      {zoomUrl && <PhotoLightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />}
    </div>;
  }

  if (mission.status !== "sent") return <MissionNote><p className="paper-label">{mission.isTest ? "TEST NOTE" : "MISSION NOTE"}</p><h1>{mission.status === "expired" ? "이 쪽지는 조용히 지나갔어요." : mission.status === "cancelled" ? "취소된 미션이에요." : "아직 열 시간이 아니에요."}</h1>{notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}</MissionNote>;

  return <MissionNote>
    <p className="paper-label">{mission.isTest ? "TEST NOTE" : "지금, 잠깐만"}</p>
    <h1>{mission.copy.title}</h1>
    <p className="mission-prompt">{mission.copy.prompt}</p>
    {mission.type === "text" && <Textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={300} rows={3} placeholder="한 문장만 남겨주세요." />}
    {mission.type === "emotion" && <div className="emotion-grid">{EMOTIONS.map((item) => <button type="button" key={item} className={emotion === item ? "selected" : ""} onClick={() => setEmotion(item)}>{item}</button>)}</div>}
    {mission.type === "photo" && <label className="file-button upload-paper">사진 한 장 담기<input type="file" accept="image/*" capture="environment" hidden onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>}
    {mission.type === "video" && <label className="file-button upload-paper">짧은 영상 담기<input type="file" accept="video/*" capture="environment" hidden onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>}
    {mission.type === "audio" && <Button type="button" variant="secondary" disabled={recordingSeconds !== null} onClick={() => void recordAudio()}>{recordingSeconds === null ? "10초 소리 담기" : <span className="recording-count">{recordingSeconds}</span>}</Button>}
    {file && <p className="selected-file-note">{file.name}</p>}
    {progress !== null && <progress max={100} value={progress}>{progress}%</progress>}
    {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
    <div className="mission-actions"><Button disabled={busy} onClick={() => void complete()}>{busy ? "보관하고 있어요…" : "이 순간 보관하기"}</Button><Button variant="quiet" disabled={busy} onClick={() => void skip()}>이번에는 그냥 지나가기</Button></div>
  </MissionNote>;
}
