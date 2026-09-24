'use client'

import { Link, NavGroup, useConfig } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'

/** Admin navigatsiyasida "Tahririyat" guruhi: navbat va review (M2-04). */
export function EditorialNavLinks() {
  const pathname = usePathname()
  const {
    config: {
      routes: { admin },
    },
  } = useConfig()
  const links = [
    { href: `${admin}/news-queue`, label: 'Yangiliklar navbati', id: 'nav-news-queue' },
    { href: `${admin}/review`, label: 'Tekshiruv (review)', id: 'nav-review' },
  ]
  return (
    <NavGroup label="Tahririyat">
      {links.map((link) => {
        const active = pathname === link.href
        return (
          <Link key={link.id} id={link.id} className="nav__link" href={link.href} prefetch={false}>
            {active && <div className="nav__link-indicator" />}
            <span className="nav__link-label">{link.label}</span>
          </Link>
        )
      })}
    </NavGroup>
  )
}
