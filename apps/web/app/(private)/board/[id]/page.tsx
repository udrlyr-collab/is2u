import type { Metadata } from "next";
import { PageShell } from "../../../../components/page-shell";
import { BoardView } from "../board-view";

export const metadata: Metadata = { title: "보드 펼쳐보기" };
export default async function BoardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PageShell className="board-page board-detail-page"><BoardView boardId={id} /></PageShell>;
}
