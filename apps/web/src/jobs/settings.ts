import type { Payload } from 'payload'

import {
  DEFAULT_BATCH_LIMIT,
  DEFAULT_DEADLINE_SEC,
  MAX_BATCH_LIMIT,
  MAX_DEADLINE_SEC,
} from './constants'

/** `scraping-settings` global'idan jobs uchun kerakli qiymatlar (default'lar bilan). */
export interface JobsSettings {
  isEnabled: boolean
  batchLimit: number
  deadlineSec: number
  maxNewItemsPerPoll: number
  maxItemAgeHours: number
  defaultPollIntervalMin: number
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, Math.floor(number)))
}

export function resolveJobsSettings(raw: Record<string, unknown> | null | undefined): JobsSettings {
  const data = raw ?? {}
  return {
    isEnabled: data.isEnabled !== false,
    batchLimit: clamp(data.jobsBatchLimit, 1, MAX_BATCH_LIMIT, DEFAULT_BATCH_LIMIT),
    deadlineSec: clamp(data.jobsDeadlineSec, 5, MAX_DEADLINE_SEC, DEFAULT_DEADLINE_SEC),
    maxNewItemsPerPoll: clamp(data.maxNewItemsPerPoll, 1, 500, 30),
    maxItemAgeHours: clamp(data.maxItemAgeHours, 1, 24 * 365, 72),
    defaultPollIntervalMin: clamp(data.defaultPollIntervalMin, 5, 1440, 15),
  }
}

export async function getJobsSettings(payload: Payload): Promise<JobsSettings> {
  const raw = await payload.findGlobal({ slug: 'scraping-settings', depth: 0 })
  return resolveJobsSettings(raw as unknown as Record<string, unknown>)
}
