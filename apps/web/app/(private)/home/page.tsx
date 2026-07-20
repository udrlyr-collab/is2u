import type { Metadata } from "next";
import { PageShell } from "../../../components/page-shell";
import { MissionBoard } from "./mission-board";

export const metadata: Metadata = { title: "추억" };
export default function HomePage() { return <PageShell><MissionBoard /></PageShell>; }
