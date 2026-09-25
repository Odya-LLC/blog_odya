import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, SetStepNav } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import type React from 'react'

import { editorialAccess } from '@/access'

import './editorial.css'

/**
 * Tahririyat custom view'lari uchun umumiy qobiq: admin navigatsiyasi (DefaultTemplate) va
 * access tekshiruvi. Payload custom root view'larni autentifikatsiyasiz ham render qiladi —
 * shuning uchun anonim foydalanuvchi login sahifasiga yo'naltiriladi, boshqa rol — "ruxsat yo'q".
 */
export function EditorialShell({
  props,
  path,
  label,
  children,
}: {
  props: AdminViewServerProps
  path: `/${string}`
  label: string
  children: React.ReactNode
}) {
  const { initPageResult, params, searchParams } = props
  const { req, permissions, visibleEntities, locale } = initPageResult
  const adminRoute = req.payload.config.routes.admin

  const access = editorialAccess(req.user)
  if (access === 'login') {
    redirect(`${adminRoute}/login?redirect=${encodeURIComponent(`${adminRoute}${path}`)}`)
  }

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <SetStepNav nav={[{ label }]} />
      <Gutter className="editorial">
        {access === 'allowed' ? (
          children
        ) : (
          <p className="editorial__empty">Bu sahifa faqat admin va muharrirlar uchun.</p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
