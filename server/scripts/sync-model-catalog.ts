/**
 * Ops script: `npm run sync:model-catalog`
 *
 * Checks every provider's models-list endpoint against the `model_pricing` table and FLAGS
 * rows the provider no longer lists. It never deletes or deactivates anything.
 * Needs MODEL_CATALOG_OPENAI_API_KEY / _ANTHROPIC_ / _GEMINI_ / _GROQ_ (read-only keys); providers
 * without a key are skipped.
 *
 * Exit codes: 0 = clean, 2 = at least one model is flagged missing, 1 = a check failed.
 */
import { PrismaClient } from '@prisma/client';
import { formatSyncReport, syncModelCatalog } from '../src/modules/pricing/model-catalog.sync';

try {
  // dotenv ships with @nestjs/config; load server/.env when present
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config();
} catch {
  /* env vars may already be set by the shell */
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const results = await syncModelCatalog(prisma as any);
    console.log(formatSyncReport(results));
    if (results.some((r) => r.status === 'error')) process.exitCode = 1;
    else if (results.some((r) => r.missing.length > 0)) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
