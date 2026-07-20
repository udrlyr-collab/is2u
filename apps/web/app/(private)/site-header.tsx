"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const baseTabs = [
  { href: "/home", label: "추억", icon: "home" },
  { href: "/calendar", label: "약속", icon: "calendar" },
  { href: "/board", label: "보드", icon: "board" },
  { href: "/settings", label: "설정", icon: "settings" },
] as const;

type TabIconName = (typeof baseTabs)[number]["icon"] | "admin";

function TabIcon({ name }: { name: TabIconName }) {
  if (name === "home") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4.5 10.5 12 4l7.5 6.5v8.25a1.25 1.25 0 0 1-1.25 1.25H5.75a1.25 1.25 0 0 1-1.25-1.25Z" /><path d="M9.5 20v-5.5h5V20" /></svg>;
  if (name === "calendar") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 6.5h14v13H5zM8 4v5M16 4v5M5 10.5h14" /><path d="m9 15 2 2 4-4" /></svg>;
  if (name === "board") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4.5 5.5h15v14h-15z" /><path d="m8 10 3-2 2.5 2.5L17 8.5M8 10v4.5M13.5 10.5V16" /><circle cx="8" cy="9.5" r=".8" /><circle cx="13.5" cy="10" r=".8" /></svg>;
  if (name === "settings") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z" /><path d="m19 13.5 1.5 1.2-2 3.45-1.85-.75a7.4 7.4 0 0 1-2.15 1.25L14.25 21h-4.5l-.25-2.35a7.4 7.4 0 0 1-2.15-1.25l-1.85.75-2-3.45L5 13.5a7.3 7.3 0 0 1 0-2.5L3.5 9.8l2-3.45 1.85.75A7.4 7.4 0 0 1 9.5 5.85l.25-2.35h4.5l.25 2.35a7.4 7.4 0 0 1 2.15 1.25l1.85-.75 2 3.45L19 11a7.3 7.3 0 0 1 0 2.5Z" /></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5.5 20V6.5h13V20zM8.5 6.5V4h7v2.5M8.5 10h7M8.5 14h7M8.5 18h4" /></svg>;
}

export function SiteHeader({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...baseTabs, { href: "/admin", label: "관리자", icon: "admin" as const }] : baseTabs;
  return <>
    <header className="site-header">
      <Link href="/home" className="wordmark" aria-label="그대로 멈춰라, 추억으로 이동">그대로 멈춰라</Link>
      <span className="header-note" aria-hidden="true">둘만의 보관함</span>
      <span className="visually-hidden">{name}님으로 로그인됨</span>
    </header>
    <nav className={`tab-dock${isAdmin ? " admin-dock" : ""}`} aria-label="주요 메뉴">
      <span className="dock-tape" aria-hidden="true" />
      {tabs.map((tab) => {
        const active = tab.href === "/home" ? pathname === "/home" : pathname.startsWith(tab.href) || (tab.href === "/calendar" && pathname.startsWith("/dates/"));
        return <Link key={tab.href} href={tab.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
          <TabIcon name={tab.icon} />
          <span>{tab.label}</span>
        </Link>;
      })}
    </nav>
  </>;
}
