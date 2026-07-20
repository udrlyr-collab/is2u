import type { Metadata } from "next";
import { PageShell } from "../../../components/page-shell";
import { BoardList } from "./board-list";

export const metadata: Metadata = { title: "우리 보드" };

export default function BoardPage() {
  return <PageShell className="board-page"><BoardList /></PageShell>;
}
