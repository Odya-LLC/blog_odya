import type { GlobalConfig } from 'payload'

import { isAdmin, isAdminOrEditor } from '@/access'

/**
 * Scraping sozlamalari (TZ §3.5, §10.15): score chegarasi va jobs/cron limitlari.
 * `isEnabled`, `jobs*`, `maxNewItemsPerPoll`, `maxItemAgeHours`, `defaultPollIntervalMin` —
 * `feed.poll` va `/api/jobs/run` (M2-01, `src/jobs/settings.ts`); `extractedTextRetentionDays` —
 * `maintenance.cleanup` (M2-03).
 *
 * `stats` — faqat job'lar yozadi (`src/jobs/stats.ts`, atomar JSONB merge): DB va R2 hajmi,
 * oxirgi tozalash natijasi, ogohlantirishlar holati (takrorlanmasligi uchun). Admin/REST orqali
 * o'zgartirilmaydi (maydon darajasidagi `update: false`) — sozlamalarni saqlash statistikani
 * eski qiymat bilan bosib ketmaydi.
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
          admin: {
            width: '33%',
            description: 'Bitta batch’dagi parallel job’lar; DB pool tufayli amalda ≤ 2',
          },
        },
        {
          name: 'jobsDeadlineSec',
          type: 'number',
          label: 'Ichki deadline (s)',
          defaultValue: 40,
          min: 5,
          // + task'lar uchun 10 s grace — Vercel function limiti (60 s) ichida qolish uchun.
          // Runner so'rov boshidan hisoblaydi va 35 s bilan cheklaydi (`BATCH_START_LIMIT_MS`).
          max: 45,
          admin: {
            width: '33%',
            description: 'So‘rov boshidan; amalda ≤ 35 s (javob 60 s limitga sig‘ishi uchun)',
          },
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
          admin: { width: '33%' },
        },
        {
          name: 'maxItemAgeHours',
          type: 'number',
          label: 'Eskirgan yangilik chegarasi (soat)',
          defaultValue: 72,
          min: 1,
          admin: {
            width: '33%',
            description: 'Feed’dagi bundan eski yozuvlar olinmaydi',
          },
        },
        {
          name: 'extractedTextRetentionDays',
          type: 'number',
          label: 'Matnni saqlash muddati (kun)',
          defaultValue: 30,
          min: 1,
          admin: {
            width: '33%',
            description:
              'Qoralamaga aylanmagan elementlarning to‘liq matni shundan keyin o‘chiriladi',
          },
        },
      ],
    },
    {
      name: 'stats',
      type: 'json',
      label: 'Statistika (job’lar yozadi)',
      access: { update: () => false },
      admin: {
        readOnly: true,
        description:
          'maintenance.cleanup (kuniga 1 marta): DB va R2 hajmi, tozalash natijasi; ogohlantirishlar holati',
      },
    },
  ],
}
