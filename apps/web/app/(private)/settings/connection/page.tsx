import type { Metadata } from "next";
import Link from "next/link";
import { ConnectionManager } from "./connection-manager";

export const metadata: Metadata = { title: "연결 관리" };

export default function ConnectionSettingsPage() {
  return <main className="content-page settings-subpage">
    <Link className="settings-back-link" href="/settings">← 설정으로</Link>
    <header className="settings-subpage-header">
      <h1>연결 관리</h1>
      <p>함께 쓰는 공간을 관리해요</p>
    </header>
    <ConnectionManager />
  </main>;
}
