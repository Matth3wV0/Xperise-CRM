import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  // Bundle workspace packages inline so the dist is self-contained.
  noExternal: ["@xperise/database", "@xperise/shared"],
  clean: true,
  dts: false,
});
