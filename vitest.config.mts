import { defineConfig } from "vitest/config";
import path from "node:path";

// Without this, vitest can't transform JSX in .tsx files (tsconfig's
// jsx:"preserve" is correct for Next.js's own build but leaves vitest with
// literal JSX to parse as JS) and can't resolve the "@/" alias used
// throughout app/lib/components — both silently fine until the first test
// imports a .tsx component or uses "@/", which is exactly what surfaced this.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  // Vite 8 defaults to its oxc transform, which reads tsconfig.json's
  // jsx:"preserve" (correct for Next's own SWC build) and leaves JSX
  // untransformed for vitest. Falling back to esbuild lets us override it.
  oxc: false,
  esbuild: {
    jsx: "automatic",
  },
});
