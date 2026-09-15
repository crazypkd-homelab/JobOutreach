import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Bundle the workspace package so the runtime image only needs node_modules for native/external deps.
  noExternal: ["@joboutreach/shared"],
  external: ["better-sqlite3"],
});
