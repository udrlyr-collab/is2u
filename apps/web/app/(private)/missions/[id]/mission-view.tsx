"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ATMOSPHERE_CATEGORY_DEFINITIONS, ATMOSPHERES, EMOTION_CATEGORY_DEFINITIONS, EMOTIONS, memoryDisplayTitle, userFacingSentence } from "@is2u/core/types";
import { Button, Field, InlineNotice, Input, MissionNote, Select, StatusSticker, Textarea } from "../../../../components/ui";
import { PaperConfirmDialog } from "../../../../components/paper-dialog";
import { CategorizedChoicePicker } from "../../../../components/categorized-choice-picker";
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
  type: MissionType;
  customTitle: string | null;
  text: string | null;
  emotion: string | null;
  createdAt: string;
  firstPinnedAt: string;
  updatedAt: string;
  author: { id: string; displayName: string; roleLabel: string } | null;
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
  copy: {
    title: string;
    prompt: string;
    inputMode: MissionType | "choice";
    inputType: "audio-recording" | "image-capture" | "video-capture" | "short-text" | "emotion-select" | "atmosphere-select";
    durationSeconds: number | null;
    maxLength: number | null;
    options?: readonly string[];
  };
};
type Payload = {
  mission: Mission;
  dateEvent: { id: string; title: string | null; note: string | null; startAt: string; endAt: string } | null;
  recipient: { id: string; displayName: string; roleLabel: string };
  memory: Memory | null;
  canEdit: boolean;
  canDelete: boolean;
};
type Notice = { tone: "info" | "error" | "success"; text: string } | null;
type DateEventOption = { id: string; title: string | null; status: string; startAt: string; endAt: string };

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });

function findAsset(memory: Memory | null, role: Asset["role"]): Asset | undefined {
  return memory?.assets.find((asset) => asset.role === role);
}

function Wave() {
  return <span className="wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>;
}

function ProcessingNote({ original, kind, onRetry }: { original?: Asset; kind: "영상" | "사진" | "소리"; onRetry: () => void }) {
  if (!original || original.processingStatus === "pending" || original.processingStatus === "processing") return <InlineNotice>{kind}을 보기 좋게 준비하고 있어요</InlineNotice>;
  if (original.processingStatus === "failed") return <div className="processing-retry"><InlineNotice tone="error">{kind}을 아직 준비하지 못했어요</InlineNotice><Button variant="quiet" size="small" onClick={onRetry}>다시 확인하기</Button></div>;
  return <InlineNotice>{kind}을 불러오고 있어요</InlineNotice>;
}

function MemoryMedia({ memory, urls, onZoom, onMediaError, onRetry }: {
  memory: Memory;
  urls: Record<string, string>;
  onZoom: (url: string) => void;
  onMediaError: (message: string) => void;
  onRetry: () => void;
}) {
  const original = findAsset(memory, "original");
  const preview = findAsset(memory, "preview");
  const poster = findAsset(memory, "poster");
  const previewUrl = preview ? urls[preview.id] : undefined;
  const posterUrl = poster ? urls[poster.id] : undefined;

  if (memory.type === "photo") return previewUrl
    ? <figure className="detail-photo-paper"><button type="button" className="detail-photo-button" onClick={() => onZoom(previewUrl)} aria-label="사진 크게 보기"><img src={previewUrl} alt="완료한 사진 미션" /></button><figcaption>사진을 누르면 크게 볼 수 있어요</figcaption></figure>
    : <ProcessingNote original={original} kind="사진" onRetry={onRetry} />;

  if (memory.type === "video") return previewUrl
    ? <div className="detail-video-paper"><video controls playsInline preload="none" poster={posterUrl} onError={() => onMediaError("영상을 불러오지 못했어요 잠시 뒤 다시 확인해 주세요")}><source src={previewUrl} type={preview?.mimeType ?? "video/mp4"} />이 브라우저에서는 영상을 재생할 수 없어요</video></div>
    : <ProcessingNote original={original} kind="영상" onRetry={onRetry} />;

  if (memory.type === "audio") return previewUrl
    ? <div className="detail-audio-paper"><Wave /><audio controls preload="metadata" src={previewUrl} onError={() => onMediaError("소리를 불러오지 못했어요")} /></div>
    : <ProcessingNote original={original} kind="소리" onRetry={onRetry} />;

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
    <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="사진 확대 보기"><button ref={closeRef} type="button" className="lightbox-close" onClick={onClose}>닫기</button><img src={url} alt="완료한 사진 전체 보기" /></div>
  </div>;
}

function CapturePicker({ kind, file, disabled, onFile }: { kind: "photo" | "video"; file: File | null; disabled: boolean; onFile: (file: File | null) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const accept = kind === "photo" ? "image/*" : "video/*";
  const label = kind === "photo" ? "사진" : "영상";
  return <div className="capture-paper">
    <div className="capture-actions"><Button type="button" variant="secondary" disabled={disabled} onClick={() => cameraRef.current?.click()}>지금 찍기</Button><Button type="button" variant="quiet" disabled={disabled} onClick={() => libraryRef.current?.click()}>{label}에서 고르기</Button></div>
    <input ref={cameraRef} type="file" accept={accept} capture="environment" hidden onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    <input ref={libraryRef} type="file" accept={accept} hidden onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    {previewUrl && <figure className="capture-preview">{kind === "photo" ? <img src={previewUrl} alt="고른 사진 미리보기" /> : <video src={previewUrl} controls playsInline preload="metadata" aria-label="고른 영상 미리보기" />}<figcaption><span>{file?.name}</span><Button type="button" variant="quiet" size="small" onClick={() => cameraRef.current?.click()}>다시 찍기</Button></figcaption></figure>}
  </div>;
}

function AudioReview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <div className="audio-review"><span>저장하기 전에 들어볼 수 있어요</span>{url && <audio controls preload="metadata" src={url} />}</div>;
}

export function MissionView({ id }: { id: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [emotionId, setEmotionId] = useState("");
  const [customEmotion, setCustomEmotion] = useState("");
  const [dateEventId, setDateEventId] = useState("");
  const [events, setEvents] = useState<DateEventOption[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [redoing, setRedoing] = useState(false);
  const [confirmRedo, setConfirmRedo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const queryEditHandled = useRef(false);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<Payload>(`/api/missions/${id}`);
      setPayload(result);
      const derived = (result.memory?.assets ?? []).filter((asset) => asset.role !== "original" && asset.processingStatus === "ready");
      const signed = await Promise.all(derived.map(async (asset) => {
        try { return [asset.id, (await apiFetch<{ url: string }>(`/api/media/${asset.id}/access`, { method: "POST" })).url] as const; }
        catch { return null; }
      }));
      setUrls(Object.fromEntries(signed.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } catch {
      setNotice({ tone: "error", text: "이 미션을 열 수 없어요 알림을 받은 계정인지 확인해 주세요" });
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void apiFetch<{ dateEvents: DateEventOption[] }>("/api/date-events")
      .then((result) => setEvents(result.dateEvents))
      .catch(() => undefined);
  }, []);

  function beginEdit(current: Payload) {
    if (!current.memory) return;
    const atmosphere = current.mission.copy.inputType === "atmosphere-select";
    const selected = atmosphere
      ? ATMOSPHERES.find((item) => item.label === current.memory?.emotion)
      : EMOTIONS.find((item) => item.label === current.memory?.emotion);
    setRedoing(true);
    setCustomTitle(current.memory.customTitle ?? "");
    setText(current.memory.text ?? "");
    setEmotionId(selected?.id ?? "");
    setCustomEmotion(selected ? "" : current.memory.emotion ?? "");
    setDateEventId(current.dateEvent?.id ?? "");
    setFile(null);
    setProgress(null);
    setNotice(null);
  }

  useEffect(() => {
    if (!payload || queryEditHandled.current || typeof window === "undefined") return;
    queryEditHandled.current = true;
    if (payload.canEdit && payload.memory && new URL(window.location.href).searchParams.get("edit") === "1") beginEdit(payload);
  }, [payload]);
  const processing = useMemo(() => {
    const original = findAsset(payload?.memory ?? null, "original");
    return original?.processingStatus === "pending" || original?.processingStatus === "processing";
  }, [payload]);
  useEffect(() => {
    if (!processing) return;
    const interval = window.setInterval(() => void load(), 4_000);
    return () => window.clearInterval(interval);
  }, [load, processing]);

  async function recordAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        setFile(new File([new Blob(chunks, { type: mimeType })], `moment-${Date.now()}.webm`, { type: mimeType }));
        recorder.current = null;
        setRecordingSeconds(null);
        setNotice({ tone: "success", text: "소리를 담았어요 저장하기 전에 들어볼 수 있어요" });
      };
      mediaRecorder.start();
      setRecordingSeconds(10);
      setNotice({ tone: "info", text: "최대 10초 동안 담고 있어요 원할 때 먼저 마칠 수 있어요" });
      const timer = window.setInterval(() => setRecordingSeconds((current) => current === null ? null : Math.max(0, current - 1)), 1000);
      window.setTimeout(() => { window.clearInterval(timer); if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 10_000);
    } catch {
      setNotice({ tone: "error", text: "마이크를 사용할 수 없어요 브라우저 권한을 확인해 주세요" });
      setRecordingSeconds(null);
    }
  }

  async function performComplete() {
    const mission = payload?.mission;
    if (!mission || busy) return;
    if (["photo", "video", "audio"].includes(mission.type) && !file && !redoing) {
      setNotice({ tone: "error", text: "먼저 남길 것을 하나 담아주세요" });
      return;
    }
    if (mission.type === "emotion" && !emotionId && !customEmotion.trim()) {
      setNotice({ tone: "error", text: "지금의 마음을 하나 골라주세요" });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const hasMedia = ["photo", "video", "audio"].includes(mission.type);
      const isAtmosphere = mission.copy.inputType === "atmosphere-select";
      const selectedAtmosphere = isAtmosphere ? ATMOSPHERES.find((item) => item.id === emotionId) : null;
      if (redoing && hasMedia && !file && payload.memory) {
        await apiFetch(`/api/memories/${payload.memory.id}`, {
          method: "PUT",
          body: JSON.stringify({ customTitle, text: payload.memory.text, dateEventId: dateEventId || null }),
        });
        setNotice({ tone: "success", text: "추억을 수정했어요" });
        window.setTimeout(() => window.location.assign("/home"), 500);
        return;
      }
      const result = await apiFetch<{ memory: { id: string } }>(`/api/missions/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          memoryType: mission.type,
          text: mission.type === "text" ? text : undefined,
          emotionId: mission.type === "emotion" && !isAtmosphere && emotionId ? emotionId : undefined,
          customEmotion: mission.type === "emotion" && isAtmosphere
            ? selectedAtmosphere?.label ?? customEmotion.trim()
            : mission.type === "emotion" && !emotionId ? customEmotion.trim() : undefined,
          customTitle: redoing ? customTitle : undefined,
          dateEventId: redoing ? dateEventId || null : undefined,
          idempotencyKey: crypto.randomUUID(),
          replaceExisting: redoing,
          deferReplacement: redoing && hasMedia,
        }),
      });
      if (file) {
        setProgress(0);
        await uploadFile(result.memory.id, file, setProgress);
      }
      if (redoing && hasMedia) {
        await apiFetch(`/api/missions/${id}/finalize-replacement`, { method: "POST", body: JSON.stringify({ memoryId: result.memory.id }) });
      }
      setNotice({ tone: "success", text: redoing ? "추억을 수정했어요" : "이 추억을 조용히 보관했어요" });
      window.setTimeout(() => window.location.assign("/home"), 700);
    } catch {
      setNotice({ tone: "error", text: "지금은 보관하지 못했어요 입력한 내용은 두고 잠시 뒤 다시 눌러주세요" });
    } finally {
      setBusy(false);
      setConfirmRedo(false);
    }
  }

  function requestComplete() {
    if (redoing) setConfirmRedo(true);
    else void performComplete();
  }

  async function skip() {
    if (!payload?.mission || busy) return;
    setBusy(true);
    try { await apiFetch(`/api/missions/${id}/skip`, { method: "POST" }); window.location.assign("/home"); }
    catch { setNotice({ tone: "error", text: "미션 상태를 바꾸지 못했어요 잠시 뒤 다시 시도해 주세요" }); setBusy(false); }
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
    } catch { setNotice({ tone: "error", text: "저장하지 못했어요 잠시 후 다시 시도해 주세요" }); }
  }

  async function deleteMemory() {
    if (!payload?.memory || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/missions/${id}`, { method: "DELETE" });
      setRemoving(true);
      window.setTimeout(() => window.location.assign("/home"), 260);
    } catch {
      setNotice({ tone: "error", text: "이 추억을 떼어내지 못했어요 직접 완료한 계정인지 확인해 주세요" });
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (!payload) return <MissionNote><p className="muted">작은 쪽지를 펼치고 있어요…</p>{notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}</MissionNote>;
  const mission = payload.mission;

  if (mission.status === "completed" && payload.memory && !redoing) {
    const memory = payload.memory;
    const hasOriginal = Boolean(findAsset(memory, "original"));
    const wasEdited = new Date(memory.updatedAt).getTime() - new Date(memory.firstPinnedAt).getTime() > 1000;
    const role = payload.recipient.roleLabel === "남자친구" ? "boyfriend" : "girlfriend";
    const displayTitle = memoryDisplayTitle({ type: memory.type, customTitle: memory.customTitle, missionTitle: mission.copy.title });
    return <div className={`mission-detail-sheet person-${role} ${removing ? "removing" : ""}`}>
      <span className="detail-sheet-tape" aria-hidden="true" />
      <header className="mission-detail-header"><div><span className={`recipient-name-tag recipient-${role}`}>{payload.recipient.roleLabel}에게 온 미션</span><h1>{displayTitle}</h1></div><StatusSticker tone="done">완료</StatusSticker></header>
      <dl className="memory-meta"><div><dt>처음 붙인 시간</dt><dd>{dateFormatter.format(new Date(memory.firstPinnedAt))} {timeFormatter.format(new Date(memory.firstPinnedAt))}</dd></div>{wasEdited && <div><dt>수정한 시간</dt><dd>{dateFormatter.format(new Date(memory.updatedAt))} {timeFormatter.format(new Date(memory.updatedAt))}</dd></div>}<div><dt>미션 대상</dt><dd>{payload.recipient.displayName} · {payload.recipient.roleLabel}</dd></div></dl>
      {payload.dateEvent?.title && !mission.isTest && <div className="memory-appointment-sticker">{payload.dateEvent.title}</div>}
      <section className="mission-copy-note"><span aria-hidden="true">✦</span><p>{userFacingSentence(mission.copy.prompt)}</p></section>
      {payload.dateEvent?.note && <section className="memory-short-note"><h2>함께 적어둔 메모</h2><p>{payload.dateEvent.note}</p></section>}
      {memory.type === "text" && <blockquote className="expanded-text-memory">“{memory.text}”</blockquote>}
      {memory.type === "emotion" && <div className="expanded-emotion-memory"><span aria-hidden="true">✦</span><strong>{memory.emotion}</strong></div>}
      <MemoryMedia memory={memory} urls={urls} onZoom={setZoomUrl} onMediaError={(text) => setNotice({ tone: "error", text })} onRetry={() => void load()} />
      {hasOriginal && ["photo", "video", "audio"].includes(memory.type) && <div className="original-download-row"><p>이 추억을 기기에 간직할 수 있어요</p><Button variant="secondary" size="small" onClick={() => void downloadOriginal(memory.id)}>{memory.type === "photo" ? "원본 사진 저장" : memory.type === "video" ? "원본 영상 저장" : "원본 음성 저장"}</Button></div>}
      {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
      <div className="memory-detail-actions">{payload.canEdit && <Button variant="secondary" onClick={() => beginEdit(payload)}>수정하기</Button>}{payload.canDelete && <Button variant="danger" onClick={() => setConfirmDelete(true)}>추억 떼기</Button>}</div>
      {zoomUrl && <PhotoLightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />}
      {confirmDelete && <PaperConfirmDialog title="이 추억을 여기서 떼어낼까요" description="떼어낸 추억은 잠시 동안 되돌릴 수 있어요" cancelLabel="아직 남겨둘게요" confirmLabel="추억 떼기" busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => void deleteMemory()} />}
    </div>;
  }

  if (mission.status !== "sent" && !redoing) return <MissionNote><p className="paper-label">MISSION NOTE</p><h1>{mission.status === "expired" ? "이 쪽지는 조용히 지나갔어요" : mission.status === "cancelled" ? "취소된 미션이에요" : "아직 열 시간이 아니에요"}</h1>{notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}</MissionNote>;

  return <MissionNote className={redoing ? "redo-note" : ""}>
    <p className="paper-label">{redoing ? "수정하는 추억" : "지금, 잠깐만"}</p>
    <h1>{redoing ? memoryDisplayTitle({ type: payload.memory?.type ?? mission.type, customTitle, missionTitle: mission.copy.title }) : mission.copy.title}</h1>
    <p className="mission-prompt">{userFacingSentence(mission.copy.prompt)}</p>
    {redoing && <Field label="제목" hint={`${customTitle.length}/30`}><Input value={customTitle} maxLength={30} placeholder="이 추억에 이름을 붙여주세요" onChange={(event) => setCustomTitle(event.target.value)} /></Field>}
    {mission.type === "text" && <Textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={mission.copy.maxLength ?? 300} rows={3} placeholder="한 문장만 남겨주세요" />}
    {mission.type === "emotion" && <CategorizedChoicePicker
      categories={mission.copy.inputType === "atmosphere-select" ? ATMOSPHERE_CATEGORY_DEFINITIONS : EMOTION_CATEGORY_DEFINITIONS}
      choices={mission.copy.inputType === "atmosphere-select" ? ATMOSPHERES : EMOTIONS}
      selectedId={emotionId}
      customValue={customEmotion}
      selectionLabel={mission.copy.inputType === "atmosphere-select" ? "선택한 분위기" : "선택한 마음"}
      ariaLabel={mission.copy.inputType === "atmosphere-select" ? "둘의 분위기 고르기" : "지금의 마음 고르기"}
      placeholder={mission.copy.inputType === "atmosphere-select" ? "우리 사이를 내 말로 적어주세요" : "말로 설명하기 어려운데 그냥 좋아"}
      onSelect={(value) => { setEmotionId(value); setCustomEmotion(""); }}
      onCustom={(value) => { setCustomEmotion(value); if (value) setEmotionId(""); }}
    />}
    {mission.type === "photo" && <CapturePicker kind="photo" file={file} disabled={busy} onFile={setFile} />}
    {mission.type === "video" && <CapturePicker kind="video" file={file} disabled={busy} onFile={setFile} />}
    {mission.type === "audio" && <div className="audio-capture">{recordingSeconds === null ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void recordAudio()}>{file ? "다시 녹음하기" : "10초 소리 담기"}</Button> : <Button type="button" variant="secondary" disabled={busy} onClick={() => recorder.current?.stop()}><span className="recording-count">{recordingSeconds}</span> · 녹음 마치기</Button>}{file && <AudioReview file={file} />}</div>}
    {redoing && <Field label="연결할 약속" hint="선택 사항"><Select value={dateEventId} onChange={(event) => setDateEventId(event.target.value)}><option value="">약속에 연결하지 않기</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title || "이름 없는 약속"}</option>)}</Select></Field>}
    {progress !== null && <div className="paper-progress"><progress max={100} value={progress}>{progress}%</progress><span>{progress}%</span></div>}
    {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
    <div className="mission-actions"><Button disabled={busy} onClick={requestComplete}>{busy ? "보관하고 있어요…" : redoing ? "수정 내용 저장하기" : "이 추억 보관하기"}</Button>{redoing ? <Button variant="quiet" disabled={busy} onClick={() => setRedoing(false)}>돌아가기</Button> : <Button variant="quiet" disabled={busy} onClick={() => void skip()}>이번에는 그냥 지나가기</Button>}</div>
    {confirmRedo && <PaperConfirmDialog title="이 추억을 수정할까요" description="수정 내용을 모두 저장한 뒤에 지금 추억과 바꿔 붙일게요" cancelLabel="조금 더 생각할게요" confirmLabel="수정 내용 저장하기" busy={busy} onCancel={() => setConfirmRedo(false)} onConfirm={() => void performComplete()} />}
  </MissionNote>;
}
