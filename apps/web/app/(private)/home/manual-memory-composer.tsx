"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, InlineNotice, Input, Select, Textarea } from "../../../components/ui";
import { apiFetch } from "../../../lib/client";
import { uploadFile } from "../../../lib/upload-client";

type ManualType = "photo" | "text" | "video" | "audio";
type DateEvent = { id: string; title: string | null; status: string; startAt: string; endAt: string };
export type MemoryComposerNotice = { tone: "info" | "error" | "success"; text: string } | null;

const choices: Array<{ type: ManualType; label: string; mark: string }> = [
  { type: "photo", label: "사진 남기기", mark: "▧" },
  { type: "text", label: "글 남기기", mark: "—" },
  { type: "video", label: "영상 남기기", mark: "▷" },
  { type: "audio", label: "음성 남기기", mark: "⌁" },
];

export function FilePicker({ type, file, onFile }: { type: "photo" | "video"; file: File | null; onFile: (file: File | null) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const label = type === "photo" ? "사진" : "영상";
  return <div className="capture-paper">
    <div className="capture-actions"><Button type="button" variant="secondary" onClick={() => camera.current?.click()}>지금 찍기</Button><Button type="button" variant="quiet" onClick={() => library.current?.click()}>{label}에서 고르기</Button></div>
    <input ref={camera} type="file" accept={type === "photo" ? "image/*" : "video/*"} capture="environment" hidden onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    <input ref={library} type="file" accept={type === "photo" ? "image/*" : "video/*"} hidden onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    {preview && <figure className="capture-preview">{type === "photo" ? <img src={preview} alt="고른 사진 미리보기" /> : <video src={preview} controls playsInline preload="metadata" aria-label="고른 영상 미리보기" />}<figcaption><span>{file?.name}</span><Button type="button" variant="quiet" size="small" onClick={() => onFile(null)}>다시 고르기</Button></figcaption></figure>}
  </div>;
}

export function AudioPicker({ file, onFile, onNotice }: { file: File | null; onFile: (file: File | null) => void; onNotice: (notice: MemoryComposerNotice) => void }) {
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) { setUrl(""); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(stream);
      recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timer.current) window.clearInterval(timer.current);
        const mimeType = next.mimeType || "audio/webm";
        onFile(new File([new Blob(chunks, { type: mimeType })], `voice-${Date.now()}.webm`, { type: mimeType }));
        setRemaining(null);
        recorder.current = null;
        onNotice({ tone: "success", text: "목소리를 담았어요" });
      };
      next.start();
      setRemaining(10);
      onNotice({ tone: "info", text: "최대 10초 동안 담고 있어요" });
      timer.current = window.setInterval(() => setRemaining((value) => value === null ? null : Math.max(0, value - 1)), 1000);
      window.setTimeout(() => { if (next.state === "recording") next.stop(); }, 10_000);
    } catch { onNotice({ tone: "error", text: "마이크 권한을 확인해 주세요" }); }
  }

  return <div className="audio-capture"><Button type="button" variant="secondary" onClick={() => remaining === null ? void start() : recorder.current?.stop()}>{remaining === null ? file ? "다시 녹음하기" : "10초 목소리 담기" : `${remaining} · 녹음 마치기`}</Button>{url && <div className="audio-review"><span>저장하기 전에 들어볼 수 있어요</span><audio controls preload="metadata" src={url} /></div>}</div>;
}

export function ManualMemoryComposer({ onSaved, randomMissionEnabled = true }: { onSaved: () => void; randomMissionEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ManualType | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [events, setEvents] = useState<DateEvent[]>([]);
  const [dateEventId, setDateEventId] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<MemoryComposerNotice>(null);

  useEffect(() => {
    if (!open) return;
    void apiFetch<{ dateEvents: DateEvent[] }>("/api/date-events").then(({ dateEvents }) => {
      const now = Date.now();
      const active = dateEvents.filter((event) => event.status === "active" && new Date(event.startAt).getTime() <= now && new Date(event.endAt).getTime() >= now);
      setEvents(active);
      if (active.length === 1) setDateEventId(active[0].id);
    }).catch(() => undefined);
  }, [open]);

  function reset() {
    setType(null); setTitle(""); setText(""); setFile(null); setDateEventId(""); setProgress(null); setNotice(null);
  }

  async function makeRandomMission() {
    setBusy(true); setNotice(null);
    try {
      await apiFetch("/api/memories/manual-random", { method: "POST" });
      setNotice({ tone: "success", text: "새 미션을 붙였어요" });
      onSaved();
      window.setTimeout(() => { setOpen(false); reset(); }, 500);
    } catch { setNotice({ tone: "error", text: "미션을 만들지 못했어요" }); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!type || busy) return;
    if (title.trim().length > 30) { setNotice({ tone: "error", text: "제목은 30자까지 입력할 수 있어요" }); return; }
    if (type === "text" && !text.trim()) { setNotice({ tone: "error", text: "남길 글을 입력해 주세요" }); return; }
    if (type !== "text" && !file) { setNotice({ tone: "error", text: "먼저 남길 파일을 골라 주세요" }); return; }
    setBusy(true); setNotice(null);
    try {
      const created = await apiFetch<{ memory: { id: string } }>("/api/memories", {
        method: "POST",
        body: JSON.stringify({ type, customTitle: title, text: text.trim() || null, dateEventId: dateEventId || null, idempotencyKey: crypto.randomUUID() }),
      });
      if (file) {
        setProgress(0);
        await uploadFile(created.memory.id, file, setProgress);
        await apiFetch(`/api/memories/${created.memory.id}/finalize`, { method: "POST" });
      }
      setNotice({ tone: "success", text: "추억을 남겼어요" });
      onSaved();
      window.setTimeout(() => { setOpen(false); reset(); }, 500);
    } catch { setNotice({ tone: "error", text: "추억을 남기지 못했어요 입력한 내용은 그대로 두었어요" }); }
    finally { setBusy(false); }
  }

  return <section className="manual-memory-composer">
    <Button variant="sticker" onClick={() => { setOpen((value) => !value); if (open) reset(); }}>{open ? "추억 남기기 접기" : "＋ 추억 남기기"}</Button>
    {open && <div className="manual-memory-sheet">
      {!type && <><p className="paper-label">MEMORY PIECES</p><h2>어떤 추억을 남길까요</h2><div className="manual-memory-choices">{randomMissionEnabled && <button type="button" disabled={busy} onClick={() => void makeRandomMission()}><span aria-hidden="true">✦</span>무작위 미션 받기</button>}{choices.map((choice) => <button type="button" key={choice.type} onClick={() => { setType(choice.type); setNotice(null); }}><span aria-hidden="true">{choice.mark}</span>{choice.label}</button>)}</div>{!randomMissionEnabled && <p className="field-hint">상대와 연결하기 전에는 내 추억을 직접 남길 수 있어요</p>}</>}
      {type && <><button type="button" className="manual-memory-back" onClick={() => { reset(); }}>← 종류 다시 고르기</button><h2>{choices.find((choice) => choice.type === type)?.label}</h2><Field label="제목" hint={`${title.length}/30`}><Input value={title} maxLength={30} placeholder="이 추억에 이름을 붙여주세요" onChange={(event) => setTitle(event.target.value)} /></Field>{type === "text" ? <Field label="내용"><Textarea value={text} maxLength={300} rows={5} required placeholder="남기고 싶은 이야기를 적어주세요" onChange={(event) => setText(event.target.value)} /></Field> : <>{type === "photo" && <FilePicker type="photo" file={file} onFile={setFile} />}{type === "video" && <FilePicker type="video" file={file} onFile={setFile} />}{type === "audio" && <AudioPicker file={file} onFile={setFile} onNotice={setNotice} />}{type === "photo" && <Field label="짧은 메모" hint="선택 사항"><Textarea value={text} maxLength={300} rows={2} placeholder="사진과 함께 남길 말을 적어주세요" onChange={(event) => setText(event.target.value)} /></Field>}</>}{events.length > 0 && <Field label="연결할 약속" hint="선택 사항"><Select value={dateEventId} onChange={(event) => setDateEventId(event.target.value)}><option value="">약속에 연결하지 않기</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title || "이름 없는 약속"}</option>)}</Select></Field>}{progress !== null && <div className="paper-progress"><progress max={100} value={progress}>{progress}%</progress><span>{progress}%</span></div>}<div className="form-actions"><Button type="button" variant="quiet" disabled={busy} onClick={() => { setOpen(false); reset(); }}>아직 남기지 않을게요</Button><Button type="button" disabled={busy} onClick={() => void save()}>{busy ? "추억을 남기고 있어요…" : "추억 남기기"}</Button></div></>}
      {notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}
    </div>}
  </section>;
}
