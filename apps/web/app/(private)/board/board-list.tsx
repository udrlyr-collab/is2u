"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Field, InlineNotice, Input, Textarea } from "../../../components/ui";
import { PageHeader } from "../../../components/page-shell";
import { PaperConfirmDialog } from "../../../components/paper-dialog";
import { apiFetch } from "../../../lib/client";
import { ReadOnlyBoardPreview } from "./board-renderer";
import { type BoardItem, type BoardThread } from "./board-types";

type BoardSummary = { id: string; title: string; description: string | null; visibility: string; updatedAt: string; itemCount: number; items: BoardItem[]; threads: BoardThread[] };
type Payload = { owner: { displayName: string; connected: boolean }; canEdit: boolean; boards: BoardSummary[] };

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function BoardList() {
  const [view, setView] = useState<"self" | "partner">("self");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [dialog, setDialog] = useState<"create" | "rename" | null>(null);
  const [selected, setSelected] = useState<BoardSummary | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BoardSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (nextView = view) => {
    try { setPayload(await apiFetch<Payload>(`/api/board?list=1&view=${nextView}`)); setMessage(""); }
    catch { setPayload(null); setMessage(nextView === "partner" ? "연인의 보드 목록을 펼칠 수 없어요" : "보드 목록을 펼칠 수 없어요"); }
  }, [view]);
  useEffect(() => { void load(view); }, [load, view]);

  function openCreate() { setSelected(null); setTitle("새 보드"); setDescription(""); setDialog("create"); }
  function openRename(board: BoardSummary) { setSelected(board); setTitle(board.title); setDescription(board.description ?? ""); setDialog("rename"); }

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true); setMessage("");
    try {
      if (dialog === "create") await apiFetch("/api/board", { method: "POST", body: JSON.stringify({ title, description }) });
      else if (selected) await apiFetch("/api/board", { method: "PATCH", body: JSON.stringify({ boardId: selected.id, title, description }) });
      setDialog(null); await load("self"); setMessage(dialog === "create" ? "새 보드를 만들었어요" : "보드 이름을 바꿨어요");
    } catch { setMessage("보드를 저장하지 못했어요"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try { await apiFetch(`/api/board?id=${deleteTarget.id}`, { method: "DELETE" }); setDeleteTarget(null); await load("self"); setMessage("보드를 정리했어요"); }
    catch { setMessage("보드를 지우지 못했어요"); }
    finally { setBusy(false); }
  }

  return <div className="board-library">
    <PageHeader label="OUR CORK BOARDS" title="우리 보드" action={view === "self" ? <Button onClick={openCreate}>새 보드 만들기</Button> : undefined} />
    <div className="board-owner-switch" role="tablist" aria-label="볼 보드 목록"><button type="button" role="tab" aria-selected={view === "self"} onClick={() => setView("self")}>내 보드</button><button type="button" role="tab" aria-selected={view === "partner"} disabled={payload ? !payload.owner.connected : false} onClick={() => setView("partner")}>연인의 보드</button></div>
    {message && <InlineNotice>{message}</InlineNotice>}
    <div className="board-library-heading"><p>{payload?.owner.displayName ? `${payload.owner.displayName}의 보드` : "보드를 꺼내고 있어요"}</p><small>{payload?.boards.length ?? 0}개</small></div>
    <div className="board-library-grid">
      {payload?.boards.map((board) => <article className="board-library-card" key={board.id}>
        <Link href={`/board/${board.id}`} className="board-miniature" aria-label={`${board.title} 보드 열기`}>
          <span className="board-mini-frame" aria-hidden="true" />
          <ReadOnlyBoardPreview items={board.items} threads={board.threads} />
          {board.itemCount === 0 && <em>여기에 추억을 붙여보세요</em>}
        </Link>
        <div className="board-library-copy"><h2><Link href={`/board/${board.id}`}>{board.title}</Link></h2>{board.description && <p>{board.description}</p>}<small>{dateFormatter.format(new Date(board.updatedAt))} · {board.itemCount}개의 조각 · {payload.owner.displayName}</small></div>
        {payload.canEdit && <div className="board-library-actions"><button type="button" onClick={() => openRename(board)}>이름 바꾸기</button><Link href={`/board/${board.id}`}>보드 열기</Link><button type="button" className="danger" onClick={() => setDeleteTarget(board)}>보드 지우기</button></div>}
      </article>)}
    </div>
    {payload && payload.boards.length === 0 && <div className="board-library-empty"><span aria-hidden="true">✦</span><h2>{view === "partner" ? "아직 펼쳐볼 보드가 없어요" : "첫 보드를 만들어보세요"}</h2>{view === "self" && <button type="button" onClick={openCreate}>새 보드 만들기</button>}</div>}
    {dialog && <div className="board-dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}><section className="board-name-dialog" role="dialog" aria-modal="true" aria-labelledby="board-name-title"><p className="paper-label">NAME THE BOARD</p><h2 id="board-name-title">{dialog === "create" ? "새 보드 만들기" : "보드 이름 바꾸기"}</h2><Field label="보드 이름"><Input value={title} maxLength={80} autoFocus onChange={(event) => setTitle(event.target.value)} /></Field><Field label="짧은 설명" hint="선택 사항"><Textarea value={description} maxLength={300} rows={3} onChange={(event) => setDescription(event.target.value)} /></Field><div className="form-actions"><Button variant="quiet" onClick={() => setDialog(null)}>닫기</Button><Button disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? "저장하고 있어요…" : dialog === "create" ? "보드 만들기" : "이름 바꾸기"}</Button></div></section></div>}
    {deleteTarget && <PaperConfirmDialog title={`${deleteTarget.title} 보드를 지울까요`} description="보드에서 사용한 일반 사진과 꾸미기 조각도 함께 정리돼요 원본 추억은 그대로 남아 있어요" cancelLabel="그대로 둘게요" confirmLabel="보드 지우기" busy={busy} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} />}
  </div>;
}
