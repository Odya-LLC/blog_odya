import type { NumberField } from 'payload'

import { loadTotalViews } from './store'

/**
 * `posts.viewsTotal` (OBLOG-69) — butun davrdagi ko'rishlar, admin ro'yxati ustuni va sidebar'da,
 * faqat o'qish uchun. Virtual maydon: DB ustuni yo'q, qiymat `post_views_total` jadvalidan
 * (`afterRead`). Postning o'zida saqlanmaydi — aks holda admin'da saqlash yoki qoralama versiyani
 * chop etish eski qiymatni qayta yozib, ko'rishlarni "yo'qotardi". Virtual maydon bo'yicha
 * saralab/filtrlab bo'lmaydi (Payload cheklovi).
 *
 * Qiymat faqat tizimga kirgan foydalanuvchiga hisoblanadi (admin, MCP) — ommaviy sayt
 * so'rovlariga qo'shimcha DB so'rovi qo'shilmaydi.
 */
export const viewsTotalField: NumberField = {
  name: 'viewsTotal',
  type: 'number',
  label: 'Koʻrishlar (jami)',
  virtual: true,
  access: { create: () => false, update: () => false },
  admin: {
    position: 'sidebar',
    readOnly: true,
    disableListFilter: true,
    disableBulkEdit: true,
    description: 'Saytdagi anonim koʻrishlar (botlarsiz, 30 daqiqada bir marta) — avtomatik.',
  },
  hooks: {
    afterRead: [
      async ({ data, req }) => {
        const id = Number(data?.id)
        if (!req.user || !Number.isInteger(id) || id <= 0) return undefined
        try {
          return await loadTotalViews(req.payload, id, req)
        } catch {
          return null
        }
      },
    ],
  },
}
