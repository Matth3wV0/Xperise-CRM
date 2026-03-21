import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  // Bundle workspace packages inline so the dist is self-contained.
  // Only external npm packages (grammy, @prisma/client, etc.) remain as requires.
  noExternal: ["@xperise/database", "@xperise/shared"],
  clean: true,
  dts: false,
});
