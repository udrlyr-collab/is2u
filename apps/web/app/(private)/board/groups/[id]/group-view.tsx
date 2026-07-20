"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MemoryType } from "@is2u/core/types";
import { DetailBackLink, DetailTopline } from "../../../../../components/detail-topline";
import { Button, Field, InlineNotice, Input, Select, Textarea } from "../../../../../components/ui";
import { PaperConfirmDialog } from "../../../../../components/paper-dialog";
import { apiFetch } from "../../../../../lib/client";

type Asset = { id: string; role: "preview" | "thumbnail" | "poster"; mimeType: string };
type Memory = { id: string; type: MemoryType; title: string; text: string | null; emotion: string | null; firstPinnedAt: string; author: { displayName: string; roleLabel: string }; dateEvent: { id: string; title: string } | null; assets: Asset[] };
type Payload = { group: { id: string; name: string; note: string | null; style: string; representativeMemoryId: string | null }; canEdit: boolean; memories: Array<Memory & { position: number }> };

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

function primaryAsset(memory: Memory): Asset | undefined {
  if (memory.type === "photo") return memory.assets.find((asset) => asset.role === "thumbnail") ?? memory.assets.find((asset) => asset.role === "preview");
  if (memory.type === "video" || memory.type === "manual_video") return memory.assets.find((asset) => asset.role === "poster") ?? memory.assets.find((asset) => asset.role === "thumbnail");
  return memory.assets.find((asset) => asset.role === "preview");
}

export function GroupView({ id }: { id: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [style, setStyle] = useState("butter");
  const [memoryIds, setMemoryIds] = useState<string[]>([]);
  const [representative, setRepresentative] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const signAssets = useCallback(async (memories: Memory[]) => {
    const assets = memories.map(primaryAsset).filter((asset): asset is Asset => Boolean(asset));
    const signed = await Promise.all(assets.map(async (asset) => {
      try { return [asset.id, (await apiFetch<{ url: string }>(`/api/media/${asset.id}/access`, { method: "POST" })).url] as const; }
      catch { return null; }
    }));
    setUrls((current) => ({ ...current, ...Object.fromEntries(signed.filter((entry): entry is readonly [string, string] => Boolean(entry))) }));
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<Payload>(`/api/board/groups/${id}`);
      setPayload(result);
      setName(result.group.name);
      setNote(result.group.note ?? "");
      setStyle(result.group.style);
      setMemoryIds(result.memories.map((memory) => memory.id));
      setRepresentative(result.group.representativeMemoryId ?? result.memories[0]?.id ?? "");
      await signAssets(result.memories);
    } catch { setMessage("추억 그룹을 펼치지 못했어요"); }
  }, [id, signAssets]);

  useEffect(() => { void load(); }, [load]);

  async function beginEdit() {
    if (!payload?.canEdit) return;
    setEditing(true);
    try {
      const result = await apiFetch<{ memories: Memory[] }>("/api/board/memories");
      setAllMemories(result.memories);
      await signAssets(result.memories);
    } catch { setMessage("추억 목록을 불러오지 못했어요"); }
  }

  function toggleMemory(memoryId: string) {
    setMemoryIds((current) => current.includes(memoryId) ? current.length > 1 ? current.filter((id) => id !== memoryId) : current : [...current, memoryId]);
    if (!representative) setRepresentative(memoryId);
  }

  function move(memoryId: string, offset: number) {
    setMemoryIds((current) => {
      const from = current.indexOf(memoryId);
      const to = Math.max(0, Math.min(current.length - 1, from + offset));
      if (from < 0 || from === to) return current;
      const next = [...current];
      const [value] = next.splice(from, 1);
      next.splice(to, 0, value);
      return next;
    });
  }

  async function save() {
    if (!name.trim() || !memoryIds.length) return;
    setBusy(true);
    setMessage("저장 중…");
    try {
      await apiFetch(`/api/board/groups/${id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), note: note.trim(), style, memoryIds, representativeMemoryId: memoryIds.includes(representative) ? representative : memoryIds[0] }) });
      setEditing(false);
      setMessage("저장됨");
      await load();
    } catch { setMessage("저장하지 못했어요"); }
    finally { setBusy(false); }
  }

  async function removeGroup() {
    setBusy(true);
    try { await apiFetch(`/api/board/groups/${id}`, { method: "DELETE" }); window.location.assign("/board"); }
    catch { setMessage("그룹을 떼어내지 못했어요"); setBusy(false); setConfirmDelete(false); }
  }

  if (!payload) return <div className="board-group-sheet"><DetailTopline back={<DetailBackLink href="/board" label="보드로" ariaLabel="보드 목록으로 돌아가기" />} label="MEMORY BUNDLE" />{message ? <InlineNotice tone="error">{message}</InlineNotice> : <p>그룹을 펼치고 있어요…</p>}</div>;
  const ordered = memoryIds.map((memoryId) => (editing ? allMemories : payload.memories).find((memory) => memory.id === memoryId)).filter((memory): memory is Memory => Boolean(memory));

  return <div className={`board-group-sheet group-${style}`}>
    <DetailTopline back={<DetailBackLink href="/board" label="보드로" ariaLabel="보드 목록으로 돌아가기" />} label="MEMORY BUNDLE" />
    <header>{editing ? <Field label="번들 이름"><Input maxLength={30} value={name} onChange={(event) => setName(event.target.value)} /></Field> : <h1>{payload.group.name}</h1>}{!editing && payload.group.note && <p>{payload.group.note}</p>}</header>
    {message && <InlineNotice>{message}</InlineNotice>}
    {editing && <section className="group-edit-fields"><Field label="짧은 메모"><Textarea maxLength={200} rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></Field><Field label="종이 분위기"><Select value={style} onChange={(event) => setStyle(event.target.value)}><option value="cream">크림</option><option value="butter">버터</option><option value="sky">하늘</option><option value="strawberry">딸기</option><option value="leaf">잎사귀</option><option value="lavender">연보라</option></Select></Field><Field label="대표 추억"><Select value={memoryIds.includes(representative) ? representative : memoryIds[0]} onChange={(event) => setRepresentative(event.target.value)}>{ordered.map((memory) => <option key={memory.id} value={memory.id}>{memory.title}</option>)}</Select></Field></section>}
    <section className="group-memory-timeline">
      {ordered.map((memory, index) => { const asset = primaryAsset(memory); return <article key={memory.id}>
        <Link href={`/memories/${memory.id}`}><div className="group-memory-preview">{asset && urls[asset.id] ? <img src={urls[asset.id]} alt="" /> : <span aria-hidden="true">{memory.type === "emotion" ? "✦" : memory.type === "audio" ? "⌁" : "▧"}</span>}</div><div><h2>{memory.title}</h2>{memory.text && <p>{memory.text}</p>}{memory.emotion && <p>{memory.emotion}</p>}<small>{dateFormatter.format(new Date(memory.firstPinnedAt))} · {memory.author.displayName}</small>{memory.dateEvent && <b>{memory.dateEvent.title}</b>}</div></Link>
        {editing && <div className="group-memory-actions"><button type="button" disabled={index === 0} onClick={() => move(memory.id, -1)}>앞으로</button><button type="button" disabled={index === ordered.length - 1} onClick={() => move(memory.id, 1)}>뒤로</button><button type="button" onClick={() => toggleMemory(memory.id)}>그룹에서 빼기</button></div>}
      </article>; })}
    </section>
    {editing && <section className="group-add-memories"><h2>추억 추가하기</h2><div>{allMemories.filter((memory) => !memoryIds.includes(memory.id)).map((memory) => <button key={memory.id} type="button" onClick={() => toggleMemory(memory.id)}><span aria-hidden="true">+</span>{memory.title}</button>)}</div></section>}
    <footer>{payload.canEdit && (editing ? <><Button disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? "저장 중…" : "저장하기"}</Button><Button variant="quiet" disabled={busy} onClick={() => { setEditing(false); void load(); }}>취소</Button></> : <><Button variant="secondary" onClick={() => void beginEdit()}>그룹 꾸미기</Button><Button variant="danger" onClick={() => setConfirmDelete(true)}>그룹 떼기</Button></>)}</footer>
    {confirmDelete && <PaperConfirmDialog title="이 추억 그룹을 떼어낼까요" description="그룹만 사라지고 원본 추억은 모두 그대로 남아 있어요" confirmLabel="그룹 떼기" busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => void removeGroup()} />}
  </div>;
}
