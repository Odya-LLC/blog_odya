import type { Role } from '@/access'

/**
 * Kontent workflow'i (TZ §4.1). `scraped` — `scraped-items` holati (M2-01), post uchun emas,
 * lekin diagrammaning to'liq modeli uchun shu yerda (o'tishlar yagona manbadan tekshiriladi).
 */
export const WORKFLOW_STATES = [
  'scraped',
  'draft',
  'in_progress',
  'review',
  'scheduled',
  'published',
  'rejected',
  'archived',
] as const

export type WorkflowState = (typeof WORKFLOW_STATES)[number]

/** `posts.workflowStatus` qiymatlari (TZ §10.3). */
export const POST_WORKFLOW_STATUSES = [
  'draft',
  'in_progress',
  'review',
  'scheduled',
  'published',
  'rejected',
  'archived',
] as const satisfies readonly WorkflowState[]

export type PostWorkflowStatus = (typeof POST_WORKFLOW_STATUSES)[number]

export const WORKFLOW_STATUS_LABELS: Record<WorkflowState, string> = {
  scraped: "Yig'ilgan",
  draft: 'Qoralama',
  in_progress: 'Ishlanmoqda',
  review: 'Tekshiruvda',
  scheduled: 'Rejalashtirilgan',
  published: 'Chop etilgan',
  rejected: 'Rad etilgan',
  archived: 'Arxivlangan',
}

/** TZ §4.1 diagrammasi: ruxsat etilgan o'tishlar (qolganlari rad etiladi). */
export const WORKFLOW_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  scraped: ['draft', 'rejected'],
  draft: ['in_progress', 'rejected'],
  in_progress: ['review'],
  review: ['in_progress', 'scheduled', 'published', 'rejected'],
  scheduled: ['published'],
  published: ['archived'],
  rejected: [],
  archived: [],
}

/**
 * Qaysi holatga kim o'tkaza oladi (TZ §4.1 "Kim/nima o'tkazadi", §4.2).
 * Foydalanuvchisiz (tizim: scheduler, job, seed) o'tishlar faqat diagramma bo'yicha tekshiriladi.
 */
export const TRANSITION_ROLES: Record<WorkflowState, readonly Role[]> = {
  scraped: ['admin', 'editor'],
  draft: ['admin', 'editor'],
  in_progress: ['admin', 'editor'],
  review: ['admin', 'editor'],
  scheduled: ['admin', 'editor'],
  published: ['admin', 'editor'],
  rejected: ['admin', 'editor'],
  archived: ['admin'],
}

/** `claim` (draft → in_progress) qulfi muddati — MCP `claim_draft` bilan bir xil (TZ §6.3). */
export const CLAIM_LOCK_MS = 2 * 60 * 60 * 1000

export function isWorkflowState(value: unknown): value is WorkflowState {
  return typeof value === 'string' && (WORKFLOW_STATES as readonly string[]).includes(value)
}

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return from === to || WORKFLOW_TRANSITIONS[from].includes(to)
}

export type TransitionCheck = { ok: true } | { ok: false; status: 400 | 403; message: string }

/**
 * O'tishni tekshiradi. `role === undefined` — tizim (foydalanuvchisiz) amali.
 */
export function checkTransition(
  from: WorkflowState,
  to: WorkflowState,
  role?: Role,
): TransitionCheck {
  if (from === to) return { ok: true }
  if (!canTransition(from, to)) {
    const allowed = WORKFLOW_TRANSITIONS[from]
    return {
      ok: false,
      status: 400,
      message:
        `Holat o'tishi ruxsat etilmagan: ${from} → ${to}. ` +
        (allowed.length
          ? `"${from}" dan mumkin: ${allowed.join(', ')}.`
          : `"${from}" — yakuniy holat.`),
    }
  }
  if (role !== undefined && !TRANSITION_ROLES[to].includes(role)) {
    return {
      ok: false,
      status: 403,
      message: `"${to}" holatiga o'tkazish huquqi yo'q (rol: ${role}).`,
    }
  }
  return { ok: true }
}
