import type { Metadata } from "next";
import { BackButton } from "../../../../components/back-button";
import { MemoryDetailView } from "./memory-detail-view";

export const metadata: Metadata = { title: "추억 자세히 보기" };

export default async function MemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="page page-detail"><BackButton label="추억으로 돌아가기" /><MemoryDetailView id={id} /></main>;
}
