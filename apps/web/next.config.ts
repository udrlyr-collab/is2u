import type { NextConfig } from "next";
import path from "node:path";
import rootPackage from "../../package.json";
import { normalizeAppVersion } from "./lib/app-version";

const appVersion = normalizeAppVersion(process.env.NEXT_PUBLIC_APP_VERSION)
  ?? normalizeAppVersion(rootPackage.version)
  ?? "";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@is2u/core", "@is2u/db"],
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
