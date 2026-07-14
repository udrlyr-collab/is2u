import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-img-element": "off"
    }
  },
  globalIgnores(["**/.next/**", "**/dist/**", "coverage/**", "packages/db/migrations/**"]),
]);
