/**
 * `pnpm --filter @blog-odya/web media:regenerate` — mavjud rasmlar uchun Google News/Discover
 * variantlari (`news16x9`, `news4x3`, `news1x1`, OBLOG-57). Faqat yetishmayotganlari yaratiladi
 * (idempotent), asl fayl va eski variantlar o'zgarmaydi. `payload run` orqali (env — apps/web/.env;
 * prod — `gh workflow run media-regenerate`).
 *
 * Argumentlar (pozitsion — `payload run` `--flag` larni o'tkazmaydi): `dry-run` (faqat ro'yxat),
 * `limit=N` (ko'pi bilan N ta rasm), `batch=N` (partiya hajmi, standart 20). Masalan:
 * `pnpm --filter @blog-odya/web media:regenerate dry-run limit=5`.
 */
import { getPayload } from 'payload'

import { env } from '../env'
import { createS3MediaStorage, regenerateNewsSizes } from '../lib/media-regenerate'
import config from '../payload.config'

const args = process.argv.slice(2).map((value) => value.replace(/^--/, ''))

function numberFlag(name: string): number | undefined {
  const arg = args.find((value) => value.startsWith(`${name}=`))
  const parsed = arg ? Number(arg.split('=')[1]) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const dryRun = args.includes('dry-run')
const payload = await getPayload({ config: await config })
let exitCode = 0
try {
  const summary = await regenerateNewsSizes(payload, {
    storage: createS3MediaStorage(env),
    publicUrl: env.MEDIA_PUBLIC_URL,
    dryRun,
    limit: numberFlag('limit'),
    batchSize: numberFlag('batch'),
    log: (message) => payload.logger.info(message),
  })
  payload.logger.info(
    `media:regenerate${dryRun ? ' (dry-run)' : ''}: ko'rildi ${summary.scanned}, ` +
      `yangilandi ${summary.updated} (+${summary.sizesCreated} variant), ` +
      `o'tkazildi ${summary.skipped}, xato ${summary.failed}`,
  )
  if (summary.failed > 0) exitCode = 1
} catch (error) {
  payload.logger.error({ err: error, msg: 'media:regenerate xatosi' })
  exitCode = 1
} finally {
  await payload.destroy()
}
process.exit(exitCode)
