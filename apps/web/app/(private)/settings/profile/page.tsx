import type { Metadata } from "next";
import { DetailBackLink, DetailTopline } from "../../../../components/detail-topline";
import { ProfileEditor } from "./profile-editor";

export const metadata: Metadata = { title: "계정 정보 수정" };

export default function ProfileSettingsPage() {
  return <main className="content-page settings-subpage">
    <DetailTopline back={<DetailBackLink href="/settings" label="설정으로" ariaLabel="설정으로 돌아가기" />} label="SETTINGS" />
    <header className="settings-subpage-header">
      <h1>계정 정보 수정</h1>
      <p>내 정보를 정리해요</p>
    </header>
    <ProfileEditor />
  </main>;
}
