import type { Metadata } from "next";
import { SettingsPanel } from "./settings-panel";

export const metadata: Metadata = { title: "설정" };

export default async function SettingsPage() {
  return <main className="content-page settings-page"><div className="page-intro settings-intro"><span className="intro-tape" aria-hidden="true" /><h1>설정</h1><p>기억 상자를 쓰는 방법을 정리해요</p></div><SettingsPanel /></main>;
}
