import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getServerEnv } from "@is2u/core/env";
import { sessionCookieName, sessionFromToken } from "../../../lib/auth";
import { isMissionTestEnabledForUser } from "../../../lib/mission-test";
import { SettingsPanel } from "./settings-panel";

export const metadata: Metadata = { title: "설정" };

export default async function SettingsPage() {
  const jar = await cookies();
  const session = await sessionFromToken(jar.get(sessionCookieName())?.value);
  const env = getServerEnv();
  const missionTestAvailable = isMissionTestEnabledForUser(session?.user.id, env.ENABLE_MISSION_TEST_MODE);
  return <main className="content-page settings-page"><div className="page-intro settings-intro"><span className="intro-tape" aria-hidden="true" /><p className="paper-label">SETTINGS</p><h1>작은 설정 노트</h1><p>둘만의 보관함을 쓰는 방법을 필요한 만큼만 적어두었어요.</p></div><SettingsPanel missionTestAvailable={missionTestAvailable} /></main>;
}
