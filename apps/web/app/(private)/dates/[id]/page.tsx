import { DateDetail } from "./date-detail";
export default async function DateDetailPage({ params }: { params: Promise<{ id: string }> }) { return <main className="content-page"><DateDetail id={(await params).id} /></main>; }

