import type { CollectionConfig, ImageSize } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'

/** Rasm variantlari (TZ §3.1, §10.7) — hammasi WebP. */
const webp: ImageSize['formatOptions'] = { format: 'webp', options: { quality: 80 } }

export const MEDIA_IMAGE_SIZES = [
  { name: 'thumb', width: 320 },
  { name: 'card', width: 640 },
  { name: 'hero', width: 1280 },
  { name: 'og', width: 1200, height: 630 },
  { name: 'full', width: 1920 },
] as const satisfies ReadonlyArray<{ name: string; width: number; height?: number }>

export const MEDIA_LICENSES = [
  { value: 'own', label: "O'zimizniki" },
  { value: 'press_kit', label: 'Press-kit' },
  { value: 'unsplash', label: 'Unsplash' },
  { value: 'pexels', label: 'Pexels' },
  { value: 'cc_by', label: 'CC BY' },
  { value: 'ai_generated', label: 'AI yaratgan' },
  { value: 'other', label: 'Boshqa' },
] as const

/**
 * Media (TZ §10.7). Fayllar S3-mos saqlashda: lokal — MinIO, production — Cloudflare R2
 * (`@payloadcms/storage-s3`, `clientUploads: true` — `payload.config.ts` ga qarang).
 *
 * `alt` va `caption` — kirill versiyasi lotindan avtomatik (`cyrlSyncPlugin`, TZ §3.6).
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Media',
    plural: 'Media',
  },
  access: {
    read: () => true,
    create: isAdminOrEditor,
    update: isAdminOrEditor,
    delete: isAdmin,
  },
  admin: {
    useAsTitle: 'alt',
    defaultColumns: ['filename', 'alt', 'license', 'updatedAt'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Alt matn',
      localized: true,
      required: true,
    },
    {
      name: 'caption',
      type: 'textarea',
      label: 'Izoh (caption)',
      localized: true,
    },
    {
      name: 'credit',
      type: 'text',
      label: 'Muallif / manba',
    },
    {
      name: 'license',
      type: 'select',
      label: 'Litsenziya',
      defaultValue: 'own',
      options: MEDIA_LICENSES.map(({ label, value }) => ({ label, value })),
    },
    {
      name: 'licenseUrl',
      type: 'text',
      label: 'Litsenziya havolasi',
      validate: (value: string | null | undefined) => {
        if (!value) return true
        try {
          const url = new URL(value)
          return url.protocol === 'https:' || url.protocol === 'http:'
            ? true
            : 'Havola http(s):// bilan boshlanishi kerak'
        } catch {
          return "Havola noto'g'ri"
        }
      },
    },
  ],
  upload: {
    mimeTypes: ['image/*'],
    focalPoint: true,
    crop: true,
    adminThumbnail: 'thumb',
    imageSizes: MEDIA_IMAGE_SIZES.map((size) => ({
      ...size,
      formatOptions: webp,
      // Kichik rasm kattalashtirilmaydi (variant yaratilmaydi); og — har doim 1200×630.
      ...(size.name === 'og' ? { withoutEnlargement: false } : {}),
    })),
  },
}
