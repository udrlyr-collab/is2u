import type { Metadata } from "next";
import Link from "next/link";
import packageJson from "../../../../package.json";
import { appVersionLabel } from "../../lib/app-version";
import { RELEASE_NOTES } from "../../lib/releases";

export const metadata: Metadata = { title: "History", description: "그대로 멈춰라의 사용자용 변경 기록" };

export default function HistoryPage() {
  const version = appVersionLabel(process.env.NEXT_PUBLIC_APP_VERSION ?? packageJson.version);
  return <main className="history-page"><header><Link href="/settings" className="back-button">← 설정으로</Link><p className="paper-label">RELEASE HISTORY</p><h1>조금씩 달라진 기록</h1><p>둘의 기록함에 새로 생긴 것과 달라진 것을 모아두었어요</p>{version && <span className="history-current-version">현재 {version}</span>}</header><div className="history-ledger">{RELEASE_NOTES.map((release, index) => <article key={release.title} className={`history-note note-${index % 2 ? "sky" : "butter"}`}><span aria-hidden="true" className="history-tape" /><small>{index === 0 ? "LATEST" : "EARLIER"}</small><h2>{release.title}</h2><ul>{release.changes.map((change) => <li key={change}>{change}</li>)}</ul></article>)}</div><footer><Link href="/design">Design 안내서 보기</Link><Link href="/settings">설정으로 돌아가기</Link></footer></main>;
}
