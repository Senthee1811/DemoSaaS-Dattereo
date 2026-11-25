import type { NextConfig } from "next";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Opt-in bundle statistics (no dependency): `ANALYZE=1 npx next build --webpack` writes `.next/analyze/client-stats.json`,
 * which `node scripts/perf/bundle.mjs` turns into per-route and per-package sizes. Off by default; it does not change the build output.
 */
const analyze = process.env.ANALYZE === "1";

const nextConfig: NextConfig = {
  webpack(config, { isServer, nextRuntime }) {
    if (analyze && !isServer && !nextRuntime) {
      config.plugins.push({
        apply(compiler: { hooks: { done: { tap: (n: string, fn: (s: { toJson: (o: unknown) => unknown }) => void) => void } } }) {
          compiler.hooks.done.tap("spendguard-client-stats", (stats) => {
            const json = stats.toJson({ all: false, assets: true, chunks: true, chunkModules: true, modules: true, entrypoints: true, nestedModules: true, chunkGroups: true, ids: true });
            const dir = join(process.cwd(), ".next", "analyze");
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "client-stats.json"), JSON.stringify(json));
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;
