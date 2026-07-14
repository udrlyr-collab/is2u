import { getServerEnv } from "@is2u/core/env";
import { notFound } from "next/navigation";
import { DevSimulator } from "./simulator";

export default function DevPage() {
  const env = getServerEnv();
  if (env.NODE_ENV === "production" || env.DEV_SIMULATOR_ENABLED !== "true") notFound();
  return <main className="content-page"><h1>개발 시뮬레이터</h1><DevSimulator /></main>;
}

