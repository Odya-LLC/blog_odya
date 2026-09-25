import { McpToolError } from './result'

/**
 * Legal stok rasmlar qidiruvi (OBLOG-44, `search_stock_images`) — Pexels API
 * (https://www.pexels.com/api/documentation/). Kalit: `PEXELS_API_KEY` (ixtiyoriy env).
 *
 * Pexels litsenziyasi yuklab olib qayta joylashni ruxsat etadi; API qoidasi — fotograf va Pexels'ga
 * havola bilan atributsiya (kredit «Rasm: Muallif / Pexels», `sourceUrl` — Pexels sahifasi).
 *
 * Unsplash ataylab ulanmagan: Unsplash API qoidalari rasmlarni hotlink qilishni (o'z storage'ga
 * ko'chirmaslikni) va download-tracking'ni talab qiladi — bizning oqim (`upload_media` → R2) bunga
 * mos emas. Unsplash rasmini muharrir yoki agent sahifadan havola bilan `upload_media` qilishi
 * mumkin (Unsplash License), lekin API orqali qidiruv yo'q.
 */

export const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search'
export const PEXELS_LICENSE_URL = 'https://www.pexels.com/license/'

export interface StockSearchOptions {
  query: string
  page: number
  limit: number
  orientation?: 'landscape' | 'portrait' | 'square' | undefined
}

export interface StockCandidate {
  provider: 'pexels'
  id: number
  description: string | null
  width: number
  height: number
  photographer: string
  photographerUrl: string | null
  pageUrl: string
  previewUrl: string
  /** `upload_media` uchun tayyor argumentlar (alt — agent o'zi yozadi). */
  uploadWith: {
    url: string
    license: 'pexels'
    credit: string
    sourceUrl: string
    licenseUrl: string
  }
}

export interface StockSearchResult {
  provider: 'pexels'
  page: number
  limit: number
  totalResults: number
  hasNextPage: boolean
  candidates: StockCandidate[]
}

interface PexelsPhoto {
  id: number
  width: number
  height: number
  url: string
  photographer: string
  photographer_url?: string
  alt?: string
  src: { original: string; large2x?: string; large?: string; medium?: string }
}

interface PexelsResponse {
  page: number
  per_page: number
  total_results: number
  next_page?: string
  photos: PexelsPhoto[]
}

export async function searchPexels(
  options: StockSearchOptions,
  apiKey: string | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<StockSearchResult> {
  if (!apiKey) {
    throw new McpToolError(
      'search_stock_images sozlanmagan: serverda PEXELS_API_KEY yo‘q (administratorga murojaat ' +
        'qiling). Hozircha press-kit rasmlari (upload_media) yoki list_media dan foydalaning.',
    )
  }
  const url = new URL(PEXELS_SEARCH_URL)
  url.searchParams.set('query', options.query)
  url.searchParams.set('page', String(options.page))
  url.searchParams.set('per_page', String(options.limit))
  if (options.orientation) url.searchParams.set('orientation', options.orientation)
  let res: Response
  try {
    res = await fetchFn(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new McpToolError("Pexels API'ga ulanib bo'lmadi — birozdan keyin qayta urinib ko'ring.")
  }
  if (res.status === 429)
    throw new McpToolError('Pexels API limiti tugadi — keyinroq urinib ko‘ring.')
  if (!res.ok) throw new McpToolError(`Pexels API xatosi: HTTP ${res.status}.`)
  const body = (await res.json()) as PexelsResponse
  return {
    provider: 'pexels',
    page: body.page ?? options.page,
    limit: body.per_page ?? options.limit,
    totalResults: body.total_results ?? 0,
    hasNextPage: Boolean(body.next_page),
    candidates: (body.photos ?? []).map((photo) => {
      const credit = `Rasm: ${photo.photographer} / Pexels`
      return {
        provider: 'pexels' as const,
        id: photo.id,
        description: photo.alt?.trim() || null,
        width: photo.width,
        height: photo.height,
        photographer: photo.photographer,
        photographerUrl: photo.photographer_url ?? null,
        pageUrl: photo.url,
        previewUrl: photo.src.medium ?? photo.src.large ?? photo.src.original,
        uploadWith: {
          url: photo.src.large2x ?? photo.src.original,
          license: 'pexels' as const,
          credit,
          sourceUrl: photo.url,
          licenseUrl: PEXELS_LICENSE_URL,
        },
      }
    }),
  }
}
