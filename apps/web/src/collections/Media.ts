import type { CollectionConfig, FieldHook, ImageSize, PayloadRequest } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'
import { resolveAuditChannel } from '@/audit/channel'

/**
 * Tizim maydoni: yaratishda so'rovdan hisoblanadi, keyin o'zgarmaydi (mijoz yuborgan qiymat
 * e'tiborga olinmaydi — `uploadedVia`/`uploadedBy` ni soxtalashtirib bo'lmaydi).
 */
function systemValue(name: string, compute: (req: PayloadRequest) => unknown): FieldHook {
  return ({ operation, originalDoc, req }) => {
    if (operation === 'create') return compute(req)
    return (originalDoc as Record<string, unknown> | undefined)?.[name] ?? null
  }
}

/** Rasm variantlari (TZ §3.1, §10.7) — hammasi WebP. */
const webp: ImageSize['formatOptions'] = { format: 'webp', options: { quality: 80 } }

export const MEDIA_IMAGE_SIZES = [
  { name: 'thumb', width: 320 },
  { name: 'card', width: 640 },
  { name: 'hero', width: 1280 },
  { name: 'og', width: 1200, height: 630 },
  { name: 'full', width: 1920 },
] as const satisfies ReadonlyArray<{ name: string; width: number; height?: number }>

/** Ixtiyoriy http(s) havola maydoni. */
function validateHttpUrl(value: string | null | undefined): true | string {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? true
      : 'Havola http(s):// bilan boshlanishi kerak'
  } catch {
    return "Havola noto'g'ri"
  }
}

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
 *
 * OBLOG-44: AI agent MCP `upload_media` orqali ham yuklaydi — `licenseNote`, `sourceUrl`,
 * `uploadedVia` (`mcp`), `uploadedBy` shu uchun; litsenziya qoidalari — `src/mcp/media-policy.ts`.
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
      validate: validateHttpUrl,
    },
    {
      name: 'licenseNote',
      type: 'textarea',
      label: 'Litsenziya izohi',
      admin: {
        description:
          '«Boshqa» litsenziya uchun majburiy (MCP): yozma ruxsat kimdan va qanday olingan',
      },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      label: 'Rasm manbasi (sahifa)',
      admin: {
        description: 'Rasm olingan sahifa (masalan, Unsplash/Pexels sahifasi yoki press-kit)',
      },
      validate: validateHttpUrl,
    },
    {
      name: 'uploadedVia',
      type: 'select',
      label: 'Yuklash kanali',
      defaultValue: 'admin',
      options: [
        { label: 'Admin panel / API', value: 'admin' },
        { label: 'MCP (AI agent)', value: 'mcp' },
      ],
      hooks: {
        beforeChange: [
          systemValue('uploadedVia', (req) =>
            resolveAuditChannel(req) === 'mcp' ? 'mcp' : 'admin',
          ),
        ],
      },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'uploadedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Yuklagan',
      hooks: { beforeChange: [systemValue('uploadedBy', (req) => req.user?.id ?? null)] },
      admin: { readOnly: true, position: 'sidebar' },
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
