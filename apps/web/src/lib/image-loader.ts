/**
 * `next/image` global custom loader (`next.config.ts` → `images.loaderFile`).
 * Tayyor WebP variantni media domenidan tanlaydi — `/_next/image` (Vercel Image Optimization)
 * ishlatilmaydi. Batafsil: `./media-image.ts`.
 */
import { chooseMediaUrl } from './media-image'

type LoaderArgs = { src: string; width: number; quality?: number }

export default function mediaImageLoader({ src, width }: LoaderArgs): string {
  return chooseMediaUrl(src, width)
}
