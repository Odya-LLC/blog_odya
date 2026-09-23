import { z } from 'zod'

/**
 * `categories` kolleksiyasi seed sxemasi — TZ §10.4.
 * Maydonlar: name (L), slug, description (L), parent, meta (L), color, order, isInMenu.
 * (L) maydonlar `uz-Latn` / `uz-Cyrl` lokallari bo'yicha obyekt ko'rinishida beriladi.
 */

/** Lotin (asosiy) va kirill qiymatlari — ikkalasi ham majburiy (kirill nomlar qo'lda tasdiqlangan). */
export const localizedText = z
  .object({
    'uz-Latn': z.string().trim().min(1),
    'uz-Cyrl': z
      .string()
      .trim()
      .min(1)
      // Kirill qiymatida lotin harflari bo'lmasligi kerak (brend nomlari bundan mustasno emas — seed'da ishlatmaymiz)
      .refine((s) => !/[A-Za-z]/.test(s), 'uz-Cyrl qiymatida lotin harflari bo‘lmasligi kerak'),
  })
  .strict()

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug: kichik lotin harflari, raqamlar va "-"')
  .max(60)

export const categoryMetaSchema = z
  .object({
    title: localizedText.optional(),
    description: localizedText.optional(),
  })
  .strict()

export const categorySchema = z
  .object({
    name: localizedText,
    slug: slugSchema,
    description: localizedText,
    /** Tekis ro'yxat (§10.4) — seed'da hamma kategoriya uchun null. Aks holda ota kategoriya slug'i. */
    parent: slugSchema.nullable().default(null),
    meta: categoryMetaSchema.optional(),
    /** Brend palitrasi M0-06 da belgilanadi; seed'da ixtiyoriy. */
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    order: z.number().int().min(1),
    isInMenu: z.boolean(),
  })
  .strict()

export const categoriesSeedSchema = z
  .array(categorySchema)
  .min(1)
  .superRefine((cats, ctx) => {
    const slugs = new Set<string>()
    const orders = new Set<number>()
    cats.forEach((c, i) => {
      if (slugs.has(c.slug))
        ctx.addIssue({ code: 'custom', path: [i, 'slug'], message: `takroriy slug: ${c.slug}` })
      if (orders.has(c.order))
        ctx.addIssue({ code: 'custom', path: [i, 'order'], message: `takroriy order: ${c.order}` })
      slugs.add(c.slug)
      orders.add(c.order)
    })
    cats.forEach((c, i) => {
      if (c.parent !== null && !slugs.has(c.parent))
        ctx.addIssue({
          code: 'custom',
          path: [i, 'parent'],
          message: `noma'lum parent: ${c.parent}`,
        })
    })
  })

export type CategorySeed = z.infer<typeof categorySchema>
