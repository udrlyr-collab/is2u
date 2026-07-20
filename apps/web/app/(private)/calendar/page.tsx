import type { Metadata } from "next";
import { PageShell } from "../../../components/page-shell";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "우리의 약속들" };
export default function CalendarPage() {
  return <PageShell><CalendarView /></PageShell>;
}
