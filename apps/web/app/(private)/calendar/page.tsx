import type { Metadata } from "next";
import { CalendarView } from "./calendar-view";

export const metadata: Metadata = { title: "우리의 약속들" };
export default function CalendarPage() {
  return <main className="content-page calendar-page"><CalendarView /></main>;
}
