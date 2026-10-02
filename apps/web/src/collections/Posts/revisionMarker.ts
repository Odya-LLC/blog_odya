import type { FieldHook } from 'payload'

import type { Post } from '@/payload-types'

/**
 * Chop etilgan postdagi kutilayotgan o'zgarish belgisi (OBLOG-64) — navbat va amallar:
 * `src/editorial/revisions.ts`. Belgi faqat qoralama versiyada yashaydi; chop etilgan versiyada
 * (va asosiy hujjatda) doim `null`.
 */

type Id = number

export const REVISION_MARKER_FIELDS = ['revisionSubmittedAt', 'revisionSubmittedBy'] as const

export type RevisionMarkerField = (typeof REVISION_MARKER_FIELDS)[number]

export interface RevisionMarker {
  revisionSubmittedAt: string
  revisionSubmittedBy: Id
}

/** `req.context` kaliti: belgini yozish (faqat MCP `submit_for_review`). */
export interface RevisionMarkerContext {
  revisionMarker?: RevisionMarker
}

/**
 * Belgi maydonlari qiymati (field `beforeChange`): mijoz yuborgan qiymat e'tiborsiz qoldiriladi.
 * - chop etish (`_status: 'published'`) — `null`;
 * - `context.revisionMarker` — yangi belgi (MCP `submit_for_review`);
 * - aks holda — oxirgi versiyadagi qiymat (muharrir autosave'i yoki agentning keyingi
 *   `save_rewrite` i belgini o'chirmaydi).
 */
export function keepRevisionMarker(name: RevisionMarkerField): FieldHook<Post> {
  return ({ data, operation, originalDoc, req }) => {
    if (operation === 'create') return null
    if (data?._status === 'published') return null
    const marker = (req.context as RevisionMarkerContext | undefined)?.revisionMarker
    if (marker) return marker[name]
    const previous: unknown = originalDoc?.[name]
    if (previous === undefined || previous === null) return null
    if (typeof previous === 'object') return (previous as { id: Id }).id
    return previous
  }
}
