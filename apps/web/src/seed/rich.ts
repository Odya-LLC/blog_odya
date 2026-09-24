/**
 * Demo post uchun qo'shimcha Lexical bloklari — sayt renderer'ini (M1-05) barcha element
 * turlari bilan ko'rsatish: iqtibos, havola (Markdown orqali) hamda kod, jadval va embed
 * (Markdown konvertorida yo'q — Lexical JSON qo'lda).
 */
export const DEMO_RICH_MARKDOWN = [
  '## Namunaviy elementlar',
  '',
  '> “Har bir materialda manba koʻrsatiladi va matn tahririyat tomonidan tekshiriladi.” — tahririyat siyosati',
  '',
  'Batafsil: [tahririyat siyosati](https://blog.odya.uz/tahririyat-siyosati).',
].join('\n')

const text = (value: string) => ({
  type: 'text',
  version: 1,
  text: value,
  format: 0,
  style: '',
  mode: 'normal',
  detail: 0,
})

const paragraph = (value: string) => ({
  type: 'paragraph',
  version: 1,
  format: '',
  indent: 0,
  direction: null,
  textFormat: 0,
  textStyle: '',
  children: [text(value)],
})

const cell = (value: string, headerState: number) => ({
  type: 'tablecell',
  version: 1,
  format: '',
  indent: 0,
  direction: null,
  headerState,
  colSpan: 1,
  rowSpan: 1,
  backgroundColor: null,
  children: [paragraph(value)],
})

const row = (values: string[], headerState: number) => ({
  type: 'tablerow',
  version: 1,
  format: '',
  indent: 0,
  direction: null,
  children: values.map((value) => cell(value, headerState)),
})

const block = (id: string, fields: Record<string, unknown>) => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { id, blockName: '', ...fields },
})

export function demoRichNodes(): Record<string, unknown>[] {
  return [
    paragraph('Kod bloki (masalan, API soʻrovi):'),
    block('6700000000000000000000c1', {
      blockType: 'Code',
      language: 'shell',
      code: 'curl -s https://blog.odya.uz/api/posts?limit=1',
    }),
    paragraph('Jadval:'),
    {
      type: 'table',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        row(['Bosqich', 'Kim bajaradi'], 1),
        row(['Qayta yozish', 'AI agent yoki muharrir'], 0),
        row(['Tekshiruv', 'Muharrir'], 0),
      ],
    },
    paragraph('Video (YouTube embed):'),
    block('6700000000000000000000e1', {
      blockType: 'embed',
      url: 'https://www.youtube.com/watch?v=aircAruvnKk',
      caption: 'Neyron tarmoq nima? (3Blue1Brown, ingliz tilida)',
    }),
  ]
}
