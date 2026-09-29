'use client'

import { lazy, Suspense } from 'react'

import type { AnalyticsTargets } from '@/site/analytics'

/**
 * Analitika kodi (`AnalyticsScripts`) alohida chunk: faqat bu komponent chizilganda (ya'ni
 * `site-settings` da GA4/Metrica ID bo'lsa) yuklanadi. Root layout'dagi statik import (yoki
 * server komponentdagi `await import`) uni ID'lar bo'lmasa ham har sahifaning birinchi yuklash
 * JS'iga qo'shardi — JS byudjeti ≤ 150 KB (TZ §8.4). `React.lazy` — qo'shimcha runtime'siz
 * (`next/dynamic` dan kichik).
 */
const AnalyticsScripts = lazy(() =>
  import('./AnalyticsScripts').then((module) => ({ default: module.AnalyticsScripts })),
)

export function AnalyticsLoader(props: AnalyticsTargets) {
  return (
    <Suspense fallback={null}>
      <AnalyticsScripts {...props} />
    </Suspense>
  )
}
