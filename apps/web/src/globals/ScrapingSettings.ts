import type { GlobalConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'

/**
 * Scraping sozlamalari (TZ §3.5, §10.15): score chegarasi va jobs/cron limitlari.
 * Qiymatlardan foydalanish (feed.poll, jobs endpoint) — M2-01..M2-03.
 */
export const ScrapingSettings: GlobalConfig = {
  slug: 'scraping-settings',
  label: 'Scraping sozlamalari',
  access: {
    read: isAdminOrEditor,
    update: isAdmin,
  },
  fields: [
    {
      name: 'isEnabled',
      type: 'checkbox',
      label: "Yig'ish yoqilgan",
      defaultValue: true,
    },
    {
      name: 'minScore',
      type: 'number',
      label: 'Minimal score (navbatda ko‘rsatish)',
      defaultValue: 40,
      min: 0,
      max: 100,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'jobsBatchLimit',
          type: 'number',
          label: 'Bir chaqiruvdagi job’lar soni',
          defaultValue: 10,
          min: 1,
          max: 50,
          admin: { width: '33%' },
        },
        {
          name: 'jobsDeadlineSec',
          type: 'number',
          label: 'Ichki deadline (s)',
          defaultValue: 40,
          min: 5,
          max: 55,
          admin: { width: '33%' },
        },
        {
          name: 'maxNewItemsPerPoll',
          type: 'number',
          label: 'Bir poll’da maksimal yangi element',
          defaultValue: 30,
          min: 1,
          admin: { width: '33%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'defaultPollIntervalMin',
          type: 'number',
          label: 'Standart poll oralig‘i (daqiqa)',
          defaultValue: 15,
          min: 5,
          admin: { width: '50%' },
        },
        {
          name: 'extractedTextRetentionDays',
          type: 'number',
          label: 'Matnni saqlash muddati (kun)',
          defaultValue: 30,
          min: 1,
          admin: { width: '50%' },
        },
      ],
    },
  ],
}
