import type { PostgresAdapterArgs } from '@payloadcms/db-postgres'

import type { Env } from '@/env'

export type DatabaseMode = 'runtime' | 'migrate'

type PoolConfig = PostgresAdapterArgs['pool']

/**
 * Qaysi rejimda ishlayapmiz: `pnpm migrate*` skriptlari `PAYLOAD_MIGRATING=true` o'rnatadi.
 *
 * Staging yo'q — faqat bitta (prod) baza. Vercel'da migratsiya faqat Production deploy'da
 * (`VERCEL_ENV=production`) ruxsat etiladi: Preview deploy prod bazaga migratsiya yurgiza
 * olmaydi (`assertMigrationAllowed`).
 */
export function getDatabaseMode(
  source: Record<string, string | undefined> = process.env,
): DatabaseMode {
  if (source.PAYLOAD_MIGRATING !== 'true') return 'runtime'
  assertMigrationAllowed(source)
  return 'migrate'
}

/**
 * Vercel Preview deploy'ida (yoki muhiti noma'lum Vercel build'ida) migratsiyani taqiqlaydi.
 * `VERCEL_ENV=development` (`vercel dev` / `vercel env pull` bilan lokal) ruxsat etiladi.
 */
export function assertMigrationAllowed(
  source: Record<string, string | undefined> = process.env,
): void {
  const env = source.VERCEL_ENV
  const blocked = env === 'preview' || (source.VERCEL === '1' && !env)
  if (blocked) {
    throw new Error(
      `Migratsiya faqat Vercel Production'da ruxsat etiladi (VERCEL_ENV=${source.VERCEL_ENV ?? 'yo‘q'}). ` +
        "Preview deploy'lar prod bazaga migratsiya yurgizmaydi.",
    )
  }
}

/**
 * Runtime pool hajmi (TZ §3.7.2: Supabase Free, Supavisor transaction pooler — `pool.max` 2–3).
 *
 * `@payloadcms/db-postgres` ulanishda bitta klientni "reconnect" kuzatuvi uchun doimiy band
 * qiladi, shuning uchun 3 = 1 (band) + 2 (so'rovlar/tranzaksiyalar uchun).
 */
export const RUNTIME_POOL_MAX = 3

/**
 * Postgres pool sozlamalari.
 *
 * - `runtime` → `DATABASE_URL` (Supabase: Supavisor **transaction** pooler, port 6543).
 *   Payload/Drizzle nomli prepared statement ishlatmaydi (node-postgres `name` berilmasa
 *   unnamed statement yuboradi), shuning uchun transaction mode'da alohida sozlash shart emas.
 * - `migrate` → `DATABASE_URL_DIRECT` (direct yoki session pooler, port 5432): migratsiyalar
 *   DDL va uzun tranzaksiyalar bilan ishlaydi. Berilmagan bo'lsa — `DATABASE_URL`.
 */
export function getDatabasePoolConfig(
  env: Pick<Env, 'DATABASE_URL' | 'DATABASE_URL_DIRECT'>,
  mode: DatabaseMode,
): PoolConfig {
  if (mode === 'migrate') {
    return {
      connectionString: env.DATABASE_URL_DIRECT ?? env.DATABASE_URL ?? '',
      max: 2,
    }
  }

  return {
    connectionString: env.DATABASE_URL ?? '',
    max: RUNTIME_POOL_MAX,
    // Serverless (Vercel Fluid): bo'sh ulanishlarni tez qaytarish — pooler limitini tejaydi.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  }
}
