import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@is2u/core": fileURLToPath(new URL("./packages/core/src", import.meta.url)),
      "@is2u/db": fileURLToPath(new URL("./packages/db/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    coverage: { reporter: ["text", "html"] },
  },
});

