import type { CollectionConfig } from 'payload'

/**
 * Admin panel foydalanuvchilari (Payload auth). `name`, `role`, API kalitlar va boshqa
 * maydonlar M1-01 / M2-05 da qo'shiladi (TZ §10.11).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [],
}
