import type { Metadata } from "next";
import { MissionBoard } from "./mission-board";

export const metadata: Metadata = { title: "순간" };
export default function HomePage() { return <main className="home-page"><MissionBoard /></main>; }
