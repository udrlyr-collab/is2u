import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName, sessionFromToken } from "../../lib/auth";
import { SiteHeader } from "./site-header";
import { MissionCapabilityReporter } from "./mission-capability-reporter";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const session = await sessionFromToken(jar.get(sessionCookieName())?.value);
  if (!session) redirect("/login");
  return <div className="app-shell"><MissionCapabilityReporter /><SiteHeader name={session.user.displayName} isAdmin={session.user.role === "admin"} />{children}</div>;
}
