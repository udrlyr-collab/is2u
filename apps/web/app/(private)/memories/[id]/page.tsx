import type { Metadata } from "next";
import { BackButton } from "../../../../components/back-button";
import { MemoryDetailView } from "./memory-detail-view";

export const metadata: Metadata = { title: "추억 자세히 보기" };

export default async function MemoryDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ board?: string }> }) {
  const { id } = await params;
  const { board } = await searchParams;
  const boardId = board && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(board) ? board : undefined;
  const fallback = boardId ? `/board/${boardId}` : "/home";
  return <main className="page page-detail"><BackButton fallback={fallback} label={boardId ? "보드로 돌아가기" : "추억으로 돌아가기"} /><MemoryDetailView id={id} returnBoardId={boardId} /></main>;
}
