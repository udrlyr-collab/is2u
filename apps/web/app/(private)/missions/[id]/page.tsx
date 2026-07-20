import { BackButton } from "../../../../components/back-button";
import { DetailTopline } from "../../../../components/detail-topline";
import { MissionView } from "./mission-view";

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  return <main className="focus-page mission-focus"><div className="mission-page-stack"><DetailTopline back={<BackButton fallback="/home" label="추억으로" ariaLabel="추억 목록으로 돌아가기" />} label="OUR LITTLE MEMORIES" /><MissionView id={(await params).id} /></div></main>;
}
