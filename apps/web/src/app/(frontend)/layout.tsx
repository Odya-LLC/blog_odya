import type { Metadata } from 'next'
import React from 'react'

import './styles.css'

export const metadata: Metadata = {
  title: 'Blog Odya',
  description: "AI, IT, texnologiya va kibersport yangiliklari o'zbek tilida",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz-Latn">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
