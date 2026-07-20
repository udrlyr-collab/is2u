import type { Metadata } from "next";
import Link from "next/link";
import { ProfileEditor } from "./profile-editor";

export const metadata: Metadata = { title: "계정 정보 수정" };

export default function ProfileSettingsPage() {
  return <main className="content-page settings-subpage">
    <Link className="settings-back-link" href="/settings">← 설정으로</Link>
    <header className="settings-subpage-header">
      <h1>계정 정보 수정</h1>
      <p>내 정보를 정리해요</p>
    </header>
    <ProfileEditor />
  </main>;
}
