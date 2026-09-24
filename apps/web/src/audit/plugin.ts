import type { Config, Plugin } from 'payload'

import { AUDIT_LOGS_SLUG, AuditLogs } from '@/collections/AuditLogs'

import {
  auditCollectionAfterChange,
  auditCollectionAfterDelete,
  auditGlobalAfterChange,
  type CollectionAuditOptions,
} from './hooks'

export interface AuditLogPluginOptions {
  /** Kolleksiyaga xos sozlamalar (masalan, `skipSystemWrites`). */
  collections?: Record<string, Omit<CollectionAuditOptions, 'titleField'>>
  /** Umuman audit qilinmaydigan kolleksiyalar (`audit-logs` doim chiqariladi). */
  exclude?: string[]
}

/**
 * Audit log plagini (TZ §6.4): `audit-logs` kolleksiyasini qo'shadi va **barcha** kolleksiya
 * (`afterChange`/`afterDelete`) va global (`afterChange`) larga audit hook'larini ulaydi —
 * boshqa plaginlar qo'shganlari (`redirects`) ham. Shu sabab `plugins` ro'yxatida oxirida turadi.
 * Payload ichki kolleksiyalari (`payload-*`) plaginlardan keyin qo'shiladi — ular audit qilinmaydi.
 */
export function auditLogPlugin(options: AuditLogPluginOptions = {}): Plugin {
  const excluded = new Set([AUDIT_LOGS_SLUG, ...(options.exclude ?? [])])

  return (config: Config): Config => ({
    ...config,
    collections: [
      ...(config.collections ?? []).map((collection) => {
        if (excluded.has(collection.slug)) return collection
        const titleField = collection.admin?.useAsTitle
        const auditOptions = { ...options.collections?.[collection.slug], titleField }
        return {
          ...collection,
          hooks: {
            ...collection.hooks,
            afterChange: [
              ...(collection.hooks?.afterChange ?? []),
              auditCollectionAfterChange(auditOptions),
            ],
            afterDelete: [
              ...(collection.hooks?.afterDelete ?? []),
              auditCollectionAfterDelete(auditOptions),
            ],
          },
        }
      }),
      AuditLogs,
    ],
    globals: (config.globals ?? []).map((global) => ({
      ...global,
      hooks: {
        ...global.hooks,
        afterChange: [...(global.hooks?.afterChange ?? []), auditGlobalAfterChange()],
      },
    })),
  })
}
