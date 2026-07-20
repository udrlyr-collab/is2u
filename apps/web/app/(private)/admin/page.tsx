import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@is2u/db/client";
import { auditEvents } from "@is2u/db/schema";
import { PageHeader, PageShell } from "../../../components/page-shell";
import { sessionCookieName, sessionFromToken } from "../../../lib/auth";
import { AdminDashboard } from "./admin-dashboard";

export const metadata: Metadata = { title: "관리자", robots: { index: false, follow: false, noarchive: true, nosnippet: true } };

export default async function AdminPage() {
  const jar = await cookies();
  const session = await sessionFromToken(jar.get(sessionCookieName())?.value);
  if (!session) redirect("/login");
  if (session.user.role !== "admin") {
    await getDb().insert(auditEvents).values({ actorId: session.user.id, action: "admin.access_denied", entityType: "admin_page" });
    redirect("/home");
  }
  return <PageShell className="admin-page"><PageHeader label="PRIVATE LEDGER" title="관리 기록함" action={<span className="admin-role-stamp">관리자 전용</span>} /><AdminDashboard /></PageShell>;
}
