import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { StaticImage } from '@/components/blog/StaticImage'

function render(props: { priority?: boolean; src?: string }): string {
  return renderToString(
    createElement(StaticImage, {
      src: props.src ?? '/rasm.webp',
      alt: 'Rasm',
      fill: true,
      sizes: '100vw',
      priority: props.priority,
    }),
  )
}

/**
 * OBLOG-113: LCP rasmi (`priority`) — `<img fetchpriority="high" loading="eager">` va
 * `<link rel="preload" as="image" fetchpriority="high">`; qolganlari — `loading="lazy"`, preload'siz.
 */
describe('StaticImage', () => {
  it('priority: fetchpriority=high, loading=eager va preload fetchpriority=high bilan', () => {
    const html = render({ priority: true })
    const img = html.match(/<img[^>]*>/)?.[0] ?? ''
    expect(img).toContain('fetchPriority="high"')
    expect(img).toContain('loading="eager"')
    const links = html.match(/<link[^>]*rel="preload"[^>]*>/g) ?? []
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('as="image"')
    expect(links[0]).toContain('fetchPriority="high"')
    expect(links[0]).toContain('imageSrcSet=')
  })

  it('priority’siz: lazy, fetchpriority yo‘q, preload yo‘q', () => {
    const html = render({})
    const img = html.match(/<img[^>]*>/)?.[0] ?? ''
    expect(img).toContain('loading="lazy"')
    expect(img).not.toContain('fetchPriority')
    expect(html).not.toContain('rel="preload"')
  })
})
