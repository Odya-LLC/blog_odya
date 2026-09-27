import { createTransliterator } from '@blog-odya/shared'
import { GrammyError, HttpError } from 'grammy'
import { describe, expect, it } from 'vitest'

import { DEFAULT_TELEGRAM_TEMPLATE } from '@/globals/TelegramSettings'
import {
  buildHashtags,
  buildMessageText,
  buildPostUrl,
  CAPTION_LIMIT,
  coverPhotoUrl,
  messageHash,
  renderTemplate,
  telegramMessageLink,
  toHashtag,
  transformTemplateText,
  truncateText,
  visibleLength,
} from '@/telegram/caption'
import { classifyTelegramError, redactToken } from '@/telegram/client'
import { resolveTelegramConfig } from '@/telegram/config'

/** DB'siz: Telegram xabari (TZ §7.1) — havola/UTM, escape, heshteglar, ≤ 1024, sozlamalar, xatolar. */

const ORIGIN = 'https://blog.odya.uz'

function grammyError(code: number, description: string, retryAfter?: number) {
  return new GrammyError(
    `Call to 'sendPhoto' failed! (${code}: ${description})`,
    {
      ok: false,
      error_code: code,
      description,
      ...(retryAfter ? { parameters: { retry_after: retryAfter } } : {}),
    },
    'sendPhoto',
    {},
  )
}

describe('buildPostUrl — havola va UTM', () => {
  it('lotin: /{category}/{slug}, utm_campaign=latn', () => {
    const url = buildPostUrl({
      origin: ORIGIN,
      locale: 'uz-Latn',
      categorySlug: 'texnologiya',
      slug: 'yangi-model',
    })
    expect(url).toBe(
      'https://blog.odya.uz/texnologiya/yangi-model?utm_source=telegram&utm_medium=channel&utm_campaign=latn',
    )
  })

  it('kirill: /kr/{category}/{slug}, utm_campaign=cyrl; origin oxiridagi / hisobga olinmaydi', () => {
    const url = buildPostUrl({
      origin: `${ORIGIN}/`,
      locale: 'uz-Cyrl',
      categorySlug: 'texnologiya',
      slug: 'yangi-model',
    })
    expect(url).toBe(
      'https://blog.odya.uz/kr/texnologiya/yangi-model?utm_source=telegram&utm_medium=channel&utm_campaign=cyrl',
    )
  })
})

describe('heshteglar', () => {
  it('bir so‘z — o‘zgarishsiz, bir necha so‘z — CamelCase, tutuq belgilari olib tashlanadi', () => {
    expect(toHashtag('AI')).toBe('#AI')
    expect(toHashtag("Sun'iy intellekt")).toBe('#SuniyIntellekt')
    expect(toHashtag('Oʻzbekiston')).toBe('#Ozbekiston')
    expect(toHashtag('кибер спорт')).toBe('#КиберСпорт')
    expect(toHashtag('Apple-iPhone 17')).toBe('#AppleIPhone17')
    expect(toHashtag('2026')).toBeNull()
    expect(toHashtag(' — ')).toBeNull()
  })

  it('soni cheklanadi, takrorlar (katta-kichik harfsiz) tashlanadi', () => {
    expect(buildHashtags(['AI', 'ai', null, 'Apple', 'Google', 'Texnologiya'], 3)).toEqual([
      '#AI',
      '#Apple',
      '#Google',
    ])
    expect(buildHashtags(['AI', 'Apple'], 0)).toEqual([])
    expect(buildHashtags(['AI'], 3)).toEqual(['#AI'])
  })
})

describe('shablon va escape', () => {
  it('sarlavha qalin, maxsus belgilar escape qilinadi', () => {
    const html = renderTemplate(DEFAULT_TELEGRAM_TEMPLATE, {
      title: 'C++ & Rust <tez>',
      excerpt: 'a < b && c > d',
      url: 'https://blog.odya.uz/x/y?utm_source=telegram&utm_medium=channel',
      hashtags: ['#AI', '#Rust'],
    })
    expect(html).toBe(
      '<b>C++ &amp; Rust &lt;tez&gt;</b>\n\na &lt; b &amp;&amp; c &gt; d\n\n' +
        'Batafsil: https://blog.odya.uz/x/y?utm_source=telegram&amp;utm_medium=channel\n\n#AI #Rust',
    )
  })

  it('lid va heshteglar bo‘lmasa bo‘sh qatorlar yig‘iladi', () => {
    const html = renderTemplate(DEFAULT_TELEGRAM_TEMPLATE, {
      title: 'Sarlavha',
      excerpt: '  ',
      url: 'https://x.uz/a',
      hashtags: [],
    })
    expect(html).toBe('<b>Sarlavha</b>\n\nBatafsil: https://x.uz/a')
  })

  it('kirill: shablon matni transliteratsiya qilinadi, teg va o‘rinbosarlar saqlanadi', () => {
    const t = createTransliterator()
    const template = transformTemplateText(DEFAULT_TELEGRAM_TEMPLATE, (text) => t.toCyrillic(text))
    expect(template).toBe('<b>{{title}}</b>\n\n{{excerpt}}\n\nБатафсил: {{url}}\n\n{{hashtags}}')
  })

  it('visibleLength: teglar hisoblanmaydi, entity — 1 belgi', () => {
    expect(visibleLength('<b>a &amp; b</b>')).toBe(5)
    expect(visibleLength('&lt;&gt;&#39;&#x41;')).toBe(4)
    expect(visibleLength('😀')).toBe(2) // UTF-16 — Telegram ham shunday hisoblaydi
  })
})

describe('qisqartirish (caption ≤ 1024)', () => {
  const values = {
    title: 'OpenAI yangi modelni taqdim etdi',
    url: 'https://blog.odya.uz/ai/openai-yangi-model?utm_source=telegram&utm_medium=channel&utm_campaign=latn',
    hashtags: ['#AI', '#OpenAI', '#Texnologiya'],
  }

  it('qisqa matn o‘zgarishsiz', () => {
    const text = buildMessageText(
      DEFAULT_TELEGRAM_TEMPLATE,
      { ...values, excerpt: 'Qisqa lid.' },
      CAPTION_LIMIT,
    )
    expect(text).toBe(
      renderTemplate(DEFAULT_TELEGRAM_TEMPLATE, { ...values, excerpt: 'Qisqa lid.' }),
    )
  })

  it('uzun lid so‘z chegarasida … bilan qisqartiriladi; sarlavha, havola va heshteglar saqlanadi', () => {
    const excerpt = 'Juda uzun lid matni & belgilar <b> bilan. '.repeat(60)
    const text = buildMessageText(DEFAULT_TELEGRAM_TEMPLATE, { ...values, excerpt }, CAPTION_LIMIT)!
    expect(visibleLength(text)).toBeLessThanOrEqual(CAPTION_LIMIT)
    expect(visibleLength(text)).toBeGreaterThan(CAPTION_LIMIT - 40)
    expect(text).toContain('<b>OpenAI yangi modelni taqdim etdi</b>')
    expect(text).toContain('utm_campaign=latn')
    expect(text).toContain('#AI #OpenAI #Texnologiya')
    expect(text).toMatch(/…\n\nBatafsil:/)
    expect(text).not.toContain('<b> bilan') // lid ichidagi teg escape qilingan
  })

  it('juda uzun sarlavha ham sig‘diriladi (lidsiz)', () => {
    const text = buildMessageText(
      DEFAULT_TELEGRAM_TEMPLATE,
      { ...values, title: 'Sarlavha '.repeat(200), excerpt: 'Lid' },
      CAPTION_LIMIT,
    )!
    expect(visibleLength(text)).toBeLessThanOrEqual(CAPTION_LIMIT)
    expect(text).toContain('utm_campaign=latn')
    expect(text).not.toContain('Lid')
  })

  it('truncateText: surrogat juft (emoji) yarmida kesilmaydi', () => {
    const cut = truncateText('😀😀😀😀😀', 4)
    expect(cut).toBe('😀…')
    expect(truncateText('abc', 10)).toBe('abc')
    expect(truncateText('bir ikki uch tort besh', 12)).toBe('bir ikki…')
  })
})

describe('muqova va havolalar', () => {
  it('og → hero → asl fayl; nisbiy URL — to‘liq', () => {
    const sizes = { og: { url: 'https://media.odya.uz/a-og.webp' }, hero: { url: '/h.webp' } }
    expect(coverPhotoUrl({ url: '/a.jpg', sizes }, ORIGIN)).toBe('https://media.odya.uz/a-og.webp')
    expect(coverPhotoUrl({ url: '/a.jpg', sizes: { hero: { url: '/h.webp' } } }, ORIGIN)).toBe(
      'https://blog.odya.uz/h.webp',
    )
    expect(coverPhotoUrl({ url: '/api/media/file/a.jpg', sizes: {} }, ORIGIN)).toBe(
      'https://blog.odya.uz/api/media/file/a.jpg',
    )
    expect(coverPhotoUrl(null, ORIGIN)).toBeNull()
    expect(coverPhotoUrl(5, ORIGIN)).toBeNull()
  })

  it('telegramMessageLink: @kanal va -100… chat', () => {
    expect(telegramMessageLink('@blogodya', '42')).toBe('https://t.me/blogodya/42')
    expect(telegramMessageLink('-1001234567', '7')).toBe('https://t.me/c/1234567/7')
    expect(telegramMessageLink('12345', '7')).toBeNull()
    expect(telegramMessageLink('@blogodya', null)).toBeNull()
  })

  it('messageHash barqaror va matnga bog‘liq', () => {
    expect(messageHash('a')).toBe(messageHash('a'))
    expect(messageHash('a')).not.toBe(messageHash('b'))
  })
})

describe('resolveTelegramConfig — global ustun, env standart', () => {
  const env = {
    TELEGRAM_BOT_TOKEN: '123:abc',
    TELEGRAM_CHANNEL_LATN: '@env_latn',
    TELEGRAM_CHANNEL_CYRL: '@env_cyrl',
    TELEGRAM_ALERT_CHAT_ID: '-100env',
  }

  it('global bo‘sh — env kanallari, default shablon va 3 heshteg', () => {
    const config = resolveTelegramConfig(null, env)
    expect(config.token).toBe('123:abc')
    expect(config.channels['uz-Latn']).toMatchObject({ chatId: '@env_latn', source: 'env' })
    expect(config.channels['uz-Cyrl']).toMatchObject({ chatId: '@env_cyrl', source: 'env' })
    expect(config.template).toBe(DEFAULT_TELEGRAM_TEMPLATE)
    expect(config.hashtagsCount).toBe(3)
    expect(config.alertChatId).toBe('-100env')
  })

  it('global qatori yozuv bo‘yicha ustun; o‘chirilgan kanal — faol emas; boshqa yozuv — env', () => {
    const config = resolveTelegramConfig(
      {
        channels: [{ script: 'uz-Latn', chatId: ' @global_latn ', isEnabled: true }],
        hashtagsCount: 9,
        alertChatId: '-100global',
        template: '{{title}} {{url}}',
      },
      env,
    )
    expect(config.channels['uz-Latn']).toMatchObject({ chatId: '@global_latn', source: 'settings' })
    expect(config.channels['uz-Cyrl']).toMatchObject({ chatId: '@env_cyrl', source: 'env' })
    expect(config.hashtagsCount).toBe(5)
    expect(config.alertChatId).toBe('-100global')
    expect(config.template).toBe('{{title}} {{url}}')

    const disabled = resolveTelegramConfig(
      { channels: [{ script: 'uz-Cyrl', chatId: '@x', isEnabled: false }] },
      env,
    )
    expect(disabled.channels['uz-Cyrl']).toBeUndefined()
    expect(disabled.disabled).toEqual(['uz-Cyrl'])
  })

  it('TELEGRAM_CHANNEL_CYRL berilmagan — faqat lotin kanal', () => {
    const config = resolveTelegramConfig({ channels: [] }, { ...env, TELEGRAM_CHANNEL_CYRL: '' })
    expect(Object.keys(config.channels)).toEqual(['uz-Latn'])
    expect(resolveTelegramConfig(null, {}).token).toBeUndefined()
  })
})

describe('classifyTelegramError', () => {
  it('429 — retry_after (s → ms), qayta urinish mumkin', () => {
    const failure = classifyTelegramError(grammyError(429, 'Too Many Requests: retry after 17', 17))
    expect(failure).toMatchObject({ code: 429, retryable: true, retryAfterMs: 17_000 })
  })

  it('5xx va tarmoq xatosi — qayta urinish; 400 — yo‘q', () => {
    expect(classifyTelegramError(grammyError(502, 'Bad Gateway')).retryable).toBe(true)
    expect(
      classifyTelegramError(new HttpError('Network request failed', new Error('ECONNRESET')))
        .retryable,
    ).toBe(true)
    expect(classifyTelegramError(grammyError(400, 'Bad Request: chat not found')).retryable).toBe(
      false,
    )
  })

  it('"message is not modified" — xato emas', () => {
    const failure = classifyTelegramError(
      grammyError(400, 'Bad Request: message is not modified: specified new message content'),
    )
    expect(failure.notModified).toBe(true)
  })

  it('token matnga tushmaydi', () => {
    expect(redactToken('bot1234567890:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw failed')).toBe(
      'bot<token> failed',
    )
    const failure = classifyTelegramError(
      new Error('GET https://api.telegram.org/bot1234567890:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/x'),
    )
    expect(failure.message).not.toContain('AAHdq')
  })
})
