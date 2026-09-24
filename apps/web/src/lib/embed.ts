/**
 * Lexical `embed` bloki (TZ §10.3) URL'ini turga ajratish: YouTube, X (Twitter), Telegram post.
 * Noma'lum yoki xavfli URL — oddiy havola (`link`) sifatida chiziladi.
 */
export type Embed =
  | { kind: 'youtube'; id: string; url: string; start?: number }
  | { kind: 'x'; id: string; url: string }
  | { kind: 'telegram'; post: string; url: string }
  | { kind: 'link'; url: string }
  | { kind: 'invalid' }

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])
const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  'mobile.x.com',
])
const TELEGRAM_HOSTS = new Set(['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'])

const YOUTUBE_ID = /^[\w-]{11}$/

/** `t=90`, `t=1m30s`, `start=90` → soniyalar. */
function parseStart(value: string | null): number | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value)) return Number(value) || undefined
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  if (!match || !match[0]) return undefined
  const [, h = '0', m = '0', s = '0'] = match
  return Number(h) * 3600 + Number(m) * 60 + Number(s) || undefined
}

function youtubeId(url: URL): string | null {
  if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] ?? null
  if (!YOUTUBE_HOSTS.has(url.hostname)) return null
  if (url.pathname === '/watch') return url.searchParams.get('v')
  const [, kind, id] = url.pathname.split('/')
  if (kind === 'embed' || kind === 'shorts' || kind === 'live' || kind === 'v') return id ?? null
  return null
}

export function parseEmbedUrl(raw: string | null | undefined): Embed {
  if (!raw) return { kind: 'invalid' }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { kind: 'invalid' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'invalid' }
  url.hostname = url.hostname.toLowerCase()
  const href = url.toString()

  const ytId = youtubeId(url)
  if (ytId !== null) {
    if (!YOUTUBE_ID.test(ytId)) return { kind: 'link', url: href }
    const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'))
    return start
      ? { kind: 'youtube', id: ytId, url: href, start }
      : { kind: 'youtube', id: ytId, url: href }
  }

  if (X_HOSTS.has(url.hostname)) {
    const match = /^\/(?:[\w]{1,15}|i\/web)\/status(?:es)?\/(\d{1,25})\/?$/.exec(url.pathname)
    if (match?.[1]) {
      return { kind: 'x', id: match[1], url: `https://x.com${url.pathname.replace(/\/$/, '')}` }
    }
    return { kind: 'link', url: href }
  }

  if (TELEGRAM_HOSTS.has(url.hostname)) {
    // t.me/{channel}/{id} yoki t.me/s/{channel}/{id}; shaxsiy (t.me/c/...) postlar embed qilinmaydi.
    const match = /^\/(?:s\/)?([a-zA-Z][\w]{3,31})\/(\d{1,10})\/?$/.exec(url.pathname)
    if (match?.[1] && match[2] && match[1] !== 'c') {
      const post = `${match[1]}/${match[2]}`
      return { kind: 'telegram', post, url: `https://t.me/${post}` }
    }
    return { kind: 'link', url: href }
  }

  return { kind: 'link', url: href }
}
