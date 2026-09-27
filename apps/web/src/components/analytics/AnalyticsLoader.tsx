'use client'

import { type ComponentProps, lazy, Suspense } from 'react'

import type { ConsentAnalytics as ConsentAnalyticsType } from './ConsentAnalytics'

/**
 * Banner + analitika kodi (`ConsentAnalytics`, `next/script`) alohida chunk: faqat bu komponent
 * chizilganda (ya'ni `site-settings` da GA4/Metrica ID bo'lsa) yuklanadi. Root layout'dagi statik
 * import (yoki server komponentdagi `await import`) uni ID'lar bo'lmasa ham har sahifaning
 * birinchi yuklash JS'iga qo'shardi — JS byudjeti ≤ 150 KB (TZ §8.4). `React.lazy` — qo'shimcha
 * runtime'siz (`next/dynamic` dan kichik). Rozilik baribir faqat brauzerda aniqlanadi.
 */
const ConsentAnalytics = lazy(() =>
  import('./ConsentAnalytics').then((module) => ({ default: module.ConsentAnalytics })),
)

export function AnalyticsLoader(props: ComponentProps<typeof ConsentAnalyticsType>) {
  return (
    <Suspense fallback={null}>
      <ConsentAnalytics {...props} />
    </Suspense>
  )
}
