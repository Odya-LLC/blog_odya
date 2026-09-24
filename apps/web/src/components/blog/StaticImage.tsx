import type { ImageConfigComplete } from 'next/dist/shared/lib/image-config'
import type { ImageProps } from 'next/image'
// `next/image` emas: u `Image` client komponentini ham import qiladi — server komponentdan import
// qilinganda ham client reference sifatida bundle'ga tushadi. `getImageProps` ichida ishlatiladigan
// ikki modul to'g'ridan-to'g'ri olinadi (Next.js `image-external.js` bilan bir xil).
import { getImgProps } from 'next/dist/shared/lib/get-img-props'
// Next `images.loaderFile` (`src/lib/image-loader.ts`) shu modulga alias qiladi.
import defaultLoader from 'next/dist/shared/lib/image-loader'
import { preload } from 'react-dom'

type StaticImageProps = Omit<ImageProps, 'loader' | 'onLoad' | 'onError' | 'onLoadingComplete'>

/**
 * `next/image` o'rnini bosuvchi server komponent: `getImageProps()` bilan xuddi shu `srcset`/`sizes`
 * (custom loader — tayyor WebP variantlar, `src/lib/image-loader.ts`) oddiy `<img>` sifatida
 * chiziladi — client JS'siz (M1-07: `next/image` client komponenti ≈ 6 KB gzip edi, birinchi
 * yuklash JS ≤ 150 KB, TZ §8.4). `priority` — `loading="eager"` va
 * `<link rel="preload" as="image" fetchpriority="high">` (LCP rasmi).
 */
export function StaticImage({ alt, priority, ...rest }: StaticImageProps) {
  const { props } = getImgProps(
    { alt, priority, ...rest },
    {
      defaultLoader,
      // Next.js define plugin'i `next.config.ts` → `images` bilan almashtiradi.
      imgConf: process.env.__NEXT_IMAGE_OPTS as unknown as ImageConfigComplete,
    },
  )
  if (priority && props.src) {
    preload(props.src, {
      as: 'image',
      imageSrcSet: props.srcSet,
      imageSizes: props.sizes,
      fetchPriority: 'high',
    })
  }
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- `alt` props ichida
  return <img {...props} />
}
