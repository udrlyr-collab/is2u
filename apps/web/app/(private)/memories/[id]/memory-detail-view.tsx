"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { memoryDisplayTitle, type MemoryType } from "@is2u/core/types";
import { Button, Field, InlineNotice, Input, Textarea } from "../../../../components/ui";
import { PaperConfirmDialog } from "../../../../components/paper-dialog";
import { apiFetch } from "../../../../lib/client";

type Asset = { id: string; role: "original" | "preview" | "thumbnail" | "poster"; mimeType: string; processingStatus: "pending" | "processing" | "ready" | "failed" };
type Memory = { id: string; type: MemoryType; customTitle: string | null; displayTitle: string; text: string | null; firstPinnedAt: string; updatedAt: string; assets: Asset[] };
type Payload = { memory: Memory; author: { id: string; displayName: string; roleLabel: string }; dateEvent: { id: string; title: string | null } | null; canEdit: boolean; canDelete: boolean };

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  return <div className="paper-dialog-backdrop photo-lightbox-backdrop"><div className="photo-lightbox" role="dialog" aria-modal="true" aria-label="사진 크게 보기"><button ref={close} type="button" className="lightbox-close" onClick={onClose}>닫기</button><img src={url} alt="추억 사진 크게 보기" /></div></div>;
}

export function MemoryDetailView({ id }: { id: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoom, setZoom] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<Payload>(`/api/memories/${id}`);
      setPayload(result);
      const derived = result.memory.assets.filter((asset) => asset.role !== "original" && asset.processingStatus === "ready");
      const signed = await Promise.all(derived.map(async (asset) => {
        try { return [asset.id, (await apiFetch<{ url: string }>(`/api/media/${asset.id}/access`, { method: "POST" })).url] as const; }
        catch { return null; }
      }));
      setUrls(Object.fromEntries(signed.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } catch { setNotice("추억을 불러오지 못했어요"); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!payload || busy) return;
    setBusy(true); setNotice("");
    try {
      await apiFetch(`/api/memories/${id}`, { method: "PUT", body: JSON.stringify({ customTitle: title, text }) });
      setEditing(false);
      setNotice("추억을 수정했어요");
      await load();
    } catch { setNotice("추억을 수정하지 못했어요 입력한 내용은 그대로 두었어요"); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try { await apiFetch(`/api/memories/${id}`, { method: "DELETE" }); window.location.assign("/home"); }
    catch { setNotice("이 추억을 떼어내지 못했어요"); setBusy(false); setConfirmDelete(false); }
  }

  async function downloadOriginal() {
    try {
      const result = await apiFetch<{ url: string }>(`/api/memories/${id}/original`, { method: "POST" });
      window.location.assign(result.url);
    } catch { setNotice("원본을 저장하지 못했어요"); }
  }

  if (!payload) return <section className="mission-detail-sheet"><p className="muted">추억을 펼치고 있어요…</p>{notice && <InlineNotice tone="error">{notice}</InlineNotice>}</section>;
  const { memory, author, dateEvent } = payload;
  const preview = memory.assets.find((asset) => asset.role === "preview" && asset.processingStatus === "ready");
  const poster = memory.assets.find((asset) => asset.role === "poster" && asset.processingStatus === "ready");
  const original = memory.assets.find((asset) => asset.role === "original");
  const displayTitle = memoryDisplayTitle({ type: memory.type, customTitle: memory.customTitle });
  const edited = new Date(memory.updatedAt).getTime() - new Date(memory.firstPinnedAt).getTime() > 1000;
  const role = author.roleLabel === "남자친구" ? "boyfriend" : "girlfriend";

  return <section className={`mission-detail-sheet person-${role}`}>
    <span className="detail-sheet-tape" aria-hidden="true" />
    <header className="mission-detail-header"><div><h1>{displayTitle}</h1></div></header>
    <dl className="memory-meta"><div><dt>처음 붙인 시간</dt><dd>{dateFormatter.format(new Date(memory.firstPinnedAt))}</dd></div>{edited && <div><dt>수정한 시간</dt><dd>{dateFormatter.format(new Date(memory.updatedAt))}</dd></div>}<div><dt>추억을 남긴 사람</dt><dd>{author.displayName} · {author.roleLabel}</dd></div></dl>
    {dateEvent?.title && <div className="memory-appointment-sticker">{dateEvent.title}</div>}
    {memory.type === "text" && <blockquote className="expanded-text-memory">“{memory.text}”</blockquote>}
    {memory.type !== "text" && memory.text && <section className="memory-short-note"><p>{memory.text}</p></section>}
    {memory.type === "photo" && (preview && urls[preview.id] ? <figure className="detail-photo-paper"><button type="button" className="detail-photo-button" onClick={() => setZoom(urls[preview.id])}><img src={urls[preview.id]} alt="추억 사진" /></button></figure> : <InlineNotice>{original?.processingStatus === "failed" ? "사진을 준비하지 못했어요" : "사진을 보기 좋게 준비하고 있어요"}</InlineNotice>)}
    {(memory.type === "video" || memory.type === "manual_video") && (preview && urls[preview.id] ? <div className="detail-video-paper"><video controls playsInline preload="none" poster={poster ? urls[poster.id] : undefined} src={urls[preview.id]} /></div> : <InlineNotice>{original?.processingStatus === "failed" ? "영상을 준비하지 못했어요" : "영상을 보기 좋게 준비하고 있어요"}</InlineNotice>)}
    {memory.type === "audio" && (preview && urls[preview.id] ? <div className="detail-audio-paper"><audio controls preload="metadata" src={urls[preview.id]} /></div> : <InlineNotice>{original?.processingStatus === "failed" ? "목소리를 준비하지 못했어요" : "목소리를 준비하고 있어요"}</InlineNotice>)}
    {editing && <div className="memory-edit-sheet"><Field label="제목" hint={`${title.length}/30`}><Input value={title} maxLength={30} placeholder="이 추억에 이름을 붙여주세요" onChange={(event) => setTitle(event.target.value)} /></Field><Field label={memory.type === "text" ? "내용" : "짧은 메모"}><Textarea value={text} maxLength={300} rows={4} required={memory.type === "text"} onChange={(event) => setText(event.target.value)} /></Field><div className="form-actions"><Button variant="quiet" disabled={busy} onClick={() => setEditing(false)}>돌아가기</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "저장하고 있어요…" : "수정 내용 저장하기"}</Button></div></div>}
    {notice && <InlineNotice>{notice}</InlineNotice>}
    {!editing && <div className="memory-detail-actions">{payload.canEdit && <Button variant="secondary" onClick={() => { setTitle(memory.customTitle ?? ""); setText(memory.text ?? ""); setEditing(true); setNotice(""); }}>수정하기</Button>}{original && <Button variant="quiet" onClick={() => void downloadOriginal()}>원본 저장하기</Button>}{payload.canDelete && <Button variant="danger" onClick={() => setConfirmDelete(true)}>추억 떼기</Button>}</div>}
    {zoom && <Lightbox url={zoom} onClose={() => setZoom("")} />}
    {confirmDelete && <PaperConfirmDialog title="이 추억을 여기서 떼어낼까요" description="떼어낸 추억은 잠시 동안 되돌릴 수 있어요" cancelLabel="아직 남겨둘게요" confirmLabel="추억 떼기" busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />}
  </section>;
}
