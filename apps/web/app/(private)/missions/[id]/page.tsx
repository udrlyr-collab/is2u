import { BackButton } from "../../../../components/back-button";
import { MissionView } from "./mission-view";

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  return <main className="focus-page mission-focus"><div className="mission-page-stack"><BackButton fallback="/home" label="추억으로" /><MissionView id={(await params).id} /></div></main>;
}
