import type { Metadata } from "next";
import { MissionBoard } from "./mission-board";

export const metadata: Metadata = { title: "home" };
export default function HomePage() { return <main className="home-page"><MissionBoard /></main>; }
