import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName, sessionFromToken } from "../lib/auth";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const jar = await cookies();
  const session = await sessionFromToken(jar.get(sessionCookieName())?.value);
  redirect(session ? "/home" : "/login");
}

