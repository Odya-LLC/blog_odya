import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Joriy `/api/jobs/run` chaqiruvining vaqt chegarasi — task'lar (masalan, `feed.poll`) o'z
 * HTTP timeout'larini shunga moslaydi. `payload.jobs.run` shu kontekst ichida chaqiriladi,
 * shuning uchun handler'lar uni `getRunDeadline()` orqali ko'radi. `autorun` rejimida kontekst
 * yo'q — task faqat o'z byudjeti (`TASK_BUDGET_MS`) bilan cheklanadi.
 */
interface RunContext {
  /** Task'lar tugashi kerak bo'lgan eng kech vaqt (epoch ms). */
  taskDeadlineAt: number
}

const storage = new AsyncLocalStorage<RunContext>()

export function runWithDeadline<T>(context: RunContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn)
}

export function getRunDeadline(): number | undefined {
  return storage.getStore()?.taskDeadlineAt
}

/**
 * I/O timeout'i: `maxMs`, lekin run deadline'igacha qolgan vaqtdan oshmaydi (kamida `minMs` —
 * aks holda so'rov boshlanmasdan uziladi). Kontekst yo'q (`autorun`, testlar) — `maxMs`.
 */
export function boundedTimeout(maxMs: number, minMs = 1_000, now = Date.now()): number {
  const deadline = getRunDeadline()
  if (deadline === undefined) return maxMs
  return Math.max(minMs, Math.min(maxMs, deadline - now))
}
