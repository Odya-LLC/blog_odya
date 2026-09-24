import { env } from '@/env'
import { type ArchiveStorage, createS3ArchiveStorage } from '@/scraping/archive'

import { RUN_QUEUES, SCRAPE_QUEUE } from './constants'

/**
 * `scrapeItem` (`item.fetch` / `item.extract`) tashqi bog'liqliklari. Testlar ularni almashtiradi:
 * tarmoqsiz (`fetchImpl`), pauzasiz (`sleep`) va xotiradagi arxiv bilan (`storage`).
 *
 * `storage`: `undefined` — env'dan (`S3_RAW_BUCKET`), `null` — arxiv o'chiq, obyekt — shu arxiv.
 */
export interface ScrapeDeps {
  fetchImpl?: typeof fetch
  sleep: (ms: number) => Promise<void>
  now: () => number
  storage?: ArchiveStorage | null
}

export const scrapeDeps: ScrapeDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
}

let envStorage: ArchiveStorage | null | undefined

/** Arxiv (R2/MinIO). `null` — `S3_RAW_BUCKET` sozlanmagan. */
export function getArchiveStorage(): ArchiveStorage | null {
  if (scrapeDeps.storage !== undefined) return scrapeDeps.storage
  if (envStorage === undefined) envStorage = createS3ArchiveStorage(env)
  return envStorage
}

/**
 * Ishga tushiriladigan navbatlar: arxiv sozlanmagan bo'lsa `scrape` navbati chiqarib tashlanadi —
 * HTML'ni DB'ga yozmaslik uchun (TZ §3.7.2) job'lar arxiv yoqilguncha kutadi.
 */
export function resolveRunQueues(archiveEnabled: boolean): readonly string[] {
  return archiveEnabled ? RUN_QUEUES : RUN_QUEUES.filter((queue) => queue !== SCRAPE_QUEUE)
}

export function activeRunQueues(): readonly string[] {
  return resolveRunQueues(getArchiveStorage() !== null)
}
