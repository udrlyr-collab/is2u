import type { Metadata } from "next";
import { DetailBackLink, DetailTopline } from "../../../../components/detail-topline";
import { ConnectionManager } from "./connection-manager";

export const metadata: Metadata = { title: "연결 관리" };

export default function ConnectionSettingsPage() {
  return <main className="content-page settings-subpage">
    <DetailTopline back={<DetailBackLink href="/settings" label="설정으로" ariaLabel="설정으로 돌아가기" />} label="SETTINGS" />
    <header className="settings-subpage-header">
      <h1>연결 관리</h1>
      <p>함께 쓰는 공간을 관리해요</p>
    </header>
    <ConnectionManager />
  </main>;
}
