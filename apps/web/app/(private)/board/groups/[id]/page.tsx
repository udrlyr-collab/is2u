import type { Metadata } from "next";
import { PageShell } from "../../../../../components/page-shell";
import { GroupView } from "./group-view";

export const metadata: Metadata = { title: "추억 그룹" };

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  return <PageShell className="board-group-page"><GroupView id={(await params).id} /></PageShell>;
}
