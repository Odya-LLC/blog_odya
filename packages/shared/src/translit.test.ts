import { describe, expect, it } from 'vitest'

import {
  createSeededTransliterator,
  createTransliterator,
  exceptionKey,
  isApostrophe,
  lexicalPlainText,
  mergeTranslitExceptions,
  normalizeApostrophes,
  OKINA,
  protectedTermsFromGlossary,
  SEED_GLOSSARY_TERMS,
  SEED_TRANSLIT_EXCEPTIONS,
  toCyrillic,
  transliterateLexical,
  TUTUQ,
} from './index'

describe('translit: oylar (seed istisnolari)', () => {
  it.each([
    ['yanvar', 'январь'],
    ['fevral', 'февраль'],
    ['mart', 'март'],
    ['aprel', 'апрель'],
    ['may', 'май'],
    ['iyun', 'июнь'],
    ['iyul', 'июль'],
    ['avgust', 'август'],
    ['sentabr', 'сентябрь'],
    ['sentyabr', 'сентябрь'],
    ['oktabr', 'октябрь'],
    ['noyabr', 'ноябрь'],
    ['dekabr', 'декабрь'],
  ])('%s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })

  it.each([
    ['sentabrda', 'сентябрда'],
    ['Sentabrdan', 'Сентябрдан'],
    ['oktabrgacha', 'октябргача'],
    ['1-sentabr kuni', '1-сентябрь куни'],
    ['Iyul oyida', 'Июль ойида'],
    ['SENTABR', 'СЕНТЯБРЬ'],
  ])('qo‘shimcha va registr: %s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })
})

describe('translit: ts / ц', () => {
  it.each([
    ['sirk', 'цирк'],
    ['tsirk', 'цирк'],
    ['funksiya', 'функция'],
    ['funksiyalari', 'функциялари'],
    ['Informatsiyani', 'Информацияни'],
    ['litsenziya', 'лицензия'],
    ['protsessor', 'процессор'],
    ['stansiya', 'станция'],
    ['politsiya', 'полиция'],
  ])('%s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })

  it('istisnosiz `ts` — harfma-harf (т + с)', () => {
    expect(toCyrillic('otsiz')).toBe('отсиз')
  })
})

describe('translit: ye / е, e / э', () => {
  it.each([
    ['Yevropa', 'Европа'],
    ['yer', 'ер'],
    ['yetti', 'етти'],
    ['kliyent', 'клиент'],
    ['ekran', 'экран'],
    ['Eshik', 'Эшик'],
    ['elektron', 'электрон'],
    ['kelajak', 'келажак'],
    ['poeziya', 'поэзия'],
    ['duel', 'дуэль'],
    ['aeroport', 'аэропорт'],
    ['proekt', 'проект'],
  ])('%s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })
})

describe('translit: yo / ё, yu / ю, ya / я', () => {
  it.each([
    ['yozuv', 'ёзув'],
    ['Yoqubov', 'Ёқубов'],
    ['aktyor', 'актёр'],
    ['samolyot', 'самолёт'],
    ['yoʻl', 'йўл'],
    ['yuz', 'юз'],
    ['Yangi yil', 'Янги йил'],
    ['rayon', 'район'],
  ])('%s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })
})

describe('translit: oʻ / gʻ va barcha apostrof variantlari', () => {
  it.each([
    ['Oʻzbekiston', 'Ўзбекистон'],
    ["O'zbekiston", 'Ўзбекистон'],
    ['O‘zbekiston', 'Ўзбекистон'],
    ['O’zbekiston', 'Ўзбекистон'],
    ['O`zbekiston', 'Ўзбекистон'],
    ['Oʼzbekiston', 'Ўзбекистон'],
    ['O´zbekiston', 'Ўзбекистон'],
    ['gʻalaba', 'ғалаба'],
    ["g'alaba", 'ғалаба'],
    ['g‘alaba', 'ғалаба'],
    ['g’alaba', 'ғалаба'],
    ['g`alaba', 'ғалаба'],
    ['togʻ', 'тоғ'],
    ["tog'", 'тоғ'],
    ["O'ZBEKISTON", 'ЎЗБЕКИСТОН'],
    ['oʻquvchi', 'ўқувчи'],
  ])('%s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })

  it.each([
    ['maʼlumot', 'маълумот'],
    ["ma'lumot", 'маълумот'],
    ['maʻlumot', 'маълумот'],
    ['ta’lim', 'таълим'],
    ['ta‘lim', 'таълим'],
    ['sun`iy', 'сунъий'],
    ['sanʼat', 'санъат'],
    ["mas'uliyat", 'масъулият'],
    ["Is'hoq", 'Исҳоқ'],
  ])('tutuq belgisi: %s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })

  it('normalizeApostrophes: oʻ/gʻ → U+02BB, tutuq → U+02BC, qo‘shtirnoqlarga tegmaydi', () => {
    expect(normalizeApostrophes("o'g`il ma'no 'salom'")).toBe(
      `o${OKINA}g${OKINA}il ma${TUTUQ}no 'salom'`,
    )
    expect(isApostrophe('’')).toBe(true)
    expect(isApostrophe('a')).toBe(false)
  })
})

describe('translit: digraflar va umumiy matn', () => {
  it.each([
    ['shahar', 'шаҳар'],
    ['Choy', 'Чой'],
    ['SHAHAR', 'ШАҲАР'],
    ['AQSh prezidenti', 'АҚШ президенти'],
    ['Toshkentdagi tong', 'Тошкентдаги тонг'],
    ['mashq', 'машқ'],
    ['ilm-fan', 'илм-фан'],
    ['Nyu-Yorkda', 'Нью-Йоркда'],
    ['10ta kitob', '10та китоб'],
    ['XXI asr', 'XXI аср'],
    ['Salom, dunyo! Qalaysiz?', 'Салом, дунё! Қалайсиз?'],
    ['model', 'модель'],
    ['modellar', 'моделлар'],
  ])('%s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })

  it('kirill harflari va raqamlar o‘zgarmaydi', () => {
    expect(toCyrillic('Салом 2026 yil')).toBe('Салом 2026 йил')
  })

  it('bo‘sh qator', () => {
    expect(toCyrillic('')).toBe('')
  })
})

describe('translit: brendlar va chet so‘zlar (glossariy doNotTransliterate)', () => {
  it.each([
    ['ChatGPT yangilandi', 'ChatGPT янгиланди'],
    ['ChatGPTdan foydalanish', 'ChatGPTдан фойдаланиш'],
    ['Googlening yangi modeli', 'Googleнинг янги модели'],
    ['iPhone 18 narxi maʼlum boʻldi', 'iPhone 18 нархи маълум бўлди'],
    ['Apple Watch soati', 'Apple Watch соати'],
    ['Counter-Strike 2 turniri', 'Counter-Strike 2 турнири'],
    ['Mobile Legends: Bang Bang oʻyini', 'Mobile Legends: Bang Bang ўйини'],
    ['Microsoft kompaniyasi', 'Microsoft компанияси'],
    ['Samsungdan', 'Samsungдан'],
    ['Nvidia GeForce RTX', 'Nvidia GeForce РТХ'],
    ['5G tarmogʻi', '5G тармоғи'],
    ['Twitter tarmogʻi', 'Twitter тармоғи'],
    ['OnePlus va TikTok', 'OnePlus ва TikTok'],
  ])('%s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })

  it.each([
    ['Metallurgiya zavodi', 'Металлургия заводи'],
    ['Rustam aka', 'Рустам ака'],
    ['Xitoy va X tarmogʻi', 'Хитой ва X тармоғи'],
    ['Armiya', 'Армия'],
  ])('qisqa/o‘xshash so‘zlar brend deb olinmaydi: %s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })

  it('brend kichik harf bilan yozilsa — oddiy so‘z (katta-kichik harf farqlanadi)', () => {
    expect(toCyrillic('meta')).toBe('мета')
  })
})

describe('translit: URL, e-mail, @mention, #hashtag, inline kod', () => {
  it.each([
    [
      'Havola: https://blog.odya.uz/test?q=sh. Tamom',
      'Ҳавола: https://blog.odya.uz/test?q=sh. Тамом',
    ],
    ["Manba: https://example.com/a'b", "Манба: https://example.com/a'b"],
    ['www.gazeta.uz saytida', 'www.gazeta.uz сайтида'],
    ['blog.odya.uz saytida', 'blog.odya.uz сайтида'],
    ['yozing: info@odya.uz', 'ёзинг: info@odya.uz'],
    ['@odya_blog kanali', '@odya_blog канали'],
    ['#yangilik va #AI', '#yangilik ва #AI'],
    ["kod `const x = 'a'` ichida", "код `const x = 'a'` ичида"],
    ['(https://odya.uz)', '(https://odya.uz)'],
  ])('%s → %s', (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic)
  })

  it('preserveHashtags: false — hashtag o‘giriladi', () => {
    const t = createTransliterator({ preserveHashtags: false })
    expect(t.toCyrillic('#yangilik')).toBe('#янгилик')
  })
})

describe('translit: istisnolar va glossariy manbalari', () => {
  it('seed fayllari yuklangan', () => {
    expect(SEED_TRANSLIT_EXCEPTIONS.length).toBeGreaterThanOrEqual(300)
    expect(SEED_GLOSSARY_TERMS.length).toBeGreaterThanOrEqual(150)
  })

  it('DB istisnosi seed’dan ustun (whole_word)', () => {
    const t = createSeededTransliterator({
      exceptions: [{ latin: 'sentabr', cyrillic: 'сентабр', matchType: 'whole_word' }],
    })
    expect(t.toCyrillic('sentabr')).toBe('сентабр')
  })

  it('whole_word prefix’dan oldin, keyin eng uzun prefix', () => {
    const t = createTransliterator({
      exceptions: [
        { latin: 'qal', cyrillic: 'п', matchType: 'prefix' },
        { latin: 'qala', cyrillic: 'пп', matchType: 'prefix' },
        { latin: 'qalam', cyrillic: 'ж', matchType: 'whole_word' },
      ],
    })
    expect(t.word('qalam')).toBe('ж')
    expect(t.word('qalamlar')).toBe('пп' + 'млар')
    expect(t.word('qalb')).toBe('п' + 'б')
  })

  it('istisno kalitida apostroflar normallashtiriladi', () => {
    expect(exceptionKey("Qo'qon")).toBe(exceptionKey('Qoʻqon'))
    const t = createTransliterator({
      exceptions: [{ latin: "qo'qon", cyrillic: 'қўқон', matchType: 'whole_word' }],
    })
    expect(t.toCyrillic('Qoʻqonda emas, Qoʻqon')).toContain('Қўқон')
  })

  it('DB glossariysi seed brendini o‘chira oladi', () => {
    const t = createSeededTransliterator({
      glossary: [{ term: 'Telegram', language: 'en', doNotTransliterate: false }],
    })
    expect(t.toCyrillic('Telegram')).toBe('Телеграм')
    expect(t.toCyrillic('ChatGPT')).toBe('ChatGPT')
  })

  it('mergeTranslitExceptions va protectedTermsFromGlossary kalit bo‘yicha birlashtiradi', () => {
    const merged = mergeTranslitExceptions(
      [{ latin: 'a', cyrillic: 'а', matchType: 'whole_word' }],
      [{ latin: 'A', cyrillic: 'я', matchType: 'whole_word' }],
    )
    expect(merged).toEqual([{ latin: 'A', cyrillic: 'я', matchType: 'whole_word' }])
    expect(
      protectedTermsFromGlossary(
        [{ term: 'Foo', language: 'en', doNotTransliterate: true }],
        [{ term: 'Bar', language: 'en', doNotTransliterate: true }],
      ),
    ).toEqual(['Foo', 'Bar'])
  })
})

describe('translit: Lexical JSON', () => {
  const text = (value: string, format = 0) => ({
    type: 'text',
    text: value,
    format,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  })
  const paragraph = (...children: unknown[]) => ({
    type: 'paragraph',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  })
  const state = (...children: unknown[]) => ({
    root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 },
  })

  const t = (s: string) => toCyrillic(s)

  it('faqat text tugunlari o‘giriladi, tuzilma saqlanadi', () => {
    const input = state(paragraph(text('Salom '), text('dunyo', 1)))
    const output = transliterateLexical(input, t)
    expect(output.root.children[0]).toMatchObject({
      type: 'paragraph',
      children: [{ text: 'Салом ' }, { text: 'дунё', format: 1 }],
    })
    // kirish o'zgarmaydi
    expect((input.root.children[0] as { children: { text: string }[] }).children[0]!.text).toBe(
      'Salom ',
    )
  })

  it('inline kod formatidagi matn o‘zgarmaydi', () => {
    const output = transliterateLexical(state(paragraph(text('npm install', 16), text(' va'))), t)
    expect(lexicalPlainText(output)).toContain('npm install ва')
  })

  it('code bloki o‘zgarmaydi', () => {
    const code = {
      type: 'code',
      language: 'js',
      children: [{ type: 'code-highlight', text: 'const salom = 1' }],
      version: 1,
    }
    const output = transliterateLexical(state(code), t)
    expect(output.root.children[0]).toEqual(code)
  })

  it('havola URL’i o‘zgarmaydi, ko‘rinadigan matn o‘giriladi', () => {
    const link = {
      type: 'link',
      fields: { url: 'https://odya.uz/yangilik', linkType: 'custom', newTab: false },
      children: [text('yangilik')],
      version: 3,
    }
    const output = transliterateLexical(state(paragraph(link)), t)
    const outLink = (output.root.children[0] as { children: (typeof link)[] }).children[0]!
    expect(outLink.fields.url).toBe('https://odya.uz/yangilik')
    expect(outLink.children[0]!.text).toBe('янгилик')
  })

  it('Payload bloklari default holatda o‘zgarmaydi, transformBlock bilan o‘giriladi', () => {
    const block = { type: 'block', fields: { blockType: 'quote', text: 'Salom' }, version: 2 }
    expect(transliterateLexical(state(block), t).root.children[0]).toEqual(block)
    const out = transliterateLexical(state(block), t, {
      transformBlock: (node, tr) => ({
        ...node,
        fields: { ...(node.fields as object), text: tr('Salom') },
      }),
    })
    expect((out.root.children[0] as typeof block).fields.text).toBe('Салом')
  })

  it('Lexical bo‘lmagan qiymat o‘zgarishsiz qaytadi', () => {
    expect(transliterateLexical(null, t)).toBeNull()
    expect(transliterateLexical('matn', t)).toBe('matn')
  })
})
