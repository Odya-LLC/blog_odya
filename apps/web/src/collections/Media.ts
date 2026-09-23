import type { CollectionConfig } from 'payload'

/**
 * Minimal media kolleksiyasi — `@payloadcms/storage-s3` ulanishini tekshirish uchun
 * (lokal: MinIO, production: R2). To'liq maydonlar va rasm variantlari
 * (`thumb`, `card`, `hero`, `og`, `full` — WebP) M1-02 da qo'shiladi (TZ §10.7).
 */
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    mimeTypes: ['image/*'],
  },
}
