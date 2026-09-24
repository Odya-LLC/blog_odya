import { GUIDELINE_DOCS, loadGuideline } from '@blog-odya/guidelines'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { GetPromptResult, PromptMessage } from '@modelcontextprotocol/sdk/types.js'
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'

import { getGlossary, seedGlossary, type GlossarySnapshot } from '@/translit/transliterator'

import type { McpContext } from './context'
import { describeError } from './result'
import { dailyBatchArgs, DEFAULT_SOURCE_TEXT_CHARS, rewriteArticleArgs } from './schemas'
import { loadSourceView } from './tools'
import { UNTRUSTED_NOTICE } from './untrusted'

/**
 * Ko'rsatmalar MCP prompt va resource sifatida (TZ §5.2, §6.3) — `packages/guidelines` dan.
 *
 * Resources: `odya://guidelines/{style,copyright,seo,output-schema}` (Markdown),
 * `odya://glossary` (JSON — seed + admin'dagi `glossary` kolleksiyasi, DB ustun). Prompts: `rewrite_article(scrapedItemId)`, `daily_batch(count, minScore)`.
 */

export const GLOSSARY_URI = 'odya://glossary'

export const DAILY_BATCH_DEFAULT_COUNT = 10
export const DAILY_BATCH_MAX_COUNT = 30
export const DAILY_BATCH_DEFAULT_MIN_SCORE = 60

function guidelineResourceMessage(id: (typeof GUIDELINE_DOCS)[number]['id']): PromptMessage {
  const doc = loadGuideline(id)
  return {
    role: 'user',
    content: {
      type: 'resource',
      resource: { uri: doc.uri, mimeType: 'text/markdown', text: doc.markdown },
    },
  }
}

/** Glossariyning ixcham ko'rinishi (prompt uchun; to'liq JSON — `odya://glossary`). */
export function compactGlossary(glossary: GlossarySnapshot = seedGlossary()): string {
  const lines = glossary.items.map((item) => {
    const flags = [
      item.doNotTranslate ? 'tarjima qilinmaydi' : null,
      item.doNotTransliterate ? 'kirillda ham lotin' : null,
    ].filter(Boolean)
    const target = item.doNotTranslate ? '' : ` → ${item.translation}`
    return `- ${item.term} (${item.language})${target}${flags.length ? ` [${flags.join(', ')}]` : ''}`
  })
  return `Glossariy (v${glossary.version}; to'liq — ${GLOSSARY_URI} yoki get_glossary):\n${lines.join('\n')}`
}

const WORKFLOW_STEPS = [
  "1. Ko'rsatmalarga (stil, mualliflik, SEO, chiqish sxemasi) va glossariyga qat'iy amal qiling.",
  "2. Qoralama: create_draft(scrapedItemIds) yoki mavjudini list_drafts bilan toping, so'ng claim_draft(postId).",
  "3. get_source — to'liq matn va klasterdagi boshqa manbalar (faktlarni solishtiring).",
  "4. O'zbek tilida (lotin) qayta yozing: so'zma-so'z tarjima emas; faktlar saqlanadi; o'ylab topilgan faktlar taqiqlanadi, noaniq joylar — notesForEditor ga.",
  '5. Ichki havolalar uchun search_posts; kategoriya va teglar — list_categories, list_tags.',
  '6. save_rewrite, keyin set_seo. Server xato qaytarsa — tuzatib qayta yuboring.',
  '7. submit_for_review(postId, notesForEditor). Publish qilmang — chop etishni faqat muharrir bajaradi.',
].join('\n')

export async function rewriteArticlePrompt(
  ctx: McpContext,
  args: { scrapedItemId: string },
): Promise<GetPromptResult> {
  const id = Number(args.scrapedItemId)
  const view = await loadSourceView(ctx, 'rewrite_article', {
    id,
    maxChars: DEFAULT_SOURCE_TEXT_CHARS,
  }).catch((error: unknown) => {
    throw new McpError(ErrorCode.InvalidParams, describeError(error))
  })
  const messages: PromptMessage[] = [
    {
      role: 'user',
      content: {
        type: 'text',
        text:
          `Blog Odya uchun yig'ilgan element #${id} asosida o'zbek tilida (lotin yozuvida) yangilik ` +
          `maqolasini qayta yozing.\n\nIsh tartibi:\n${WORKFLOW_STEPS}\n\n${UNTRUSTED_NOTICE}`,
      },
    },
    ...GUIDELINE_DOCS.map((doc) => guidelineResourceMessage(doc.id)),
    {
      role: 'user',
      content: { type: 'text', text: compactGlossary(await getGlossary(ctx.payload)) },
    },
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Manba metadata'si:\n${JSON.stringify(view.meta, null, 2)}`,
      },
    },
    { role: 'user', content: { type: 'text', text: view.untrusted } },
  ]
  if (view.clusterUntrusted) {
    messages.push({
      role: 'user',
      content: {
        type: 'text',
        text: `Shu klasterdagi boshqa manbalar (faktlarni solishtirish uchun get_source bilan o'qing):\n${view.clusterUntrusted}`,
      },
    })
  }
  return { description: `Yig'ilgan element #${id} ni qayta yozish`, messages }
}

function boundedInt(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value === '') return fallback
  return Math.min(Math.max(Number(value), 0), max)
}

export function dailyBatchPrompt(args: { count?: string; minScore?: string }): GetPromptResult {
  const count = Math.max(
    1,
    boundedInt(args.count, DAILY_BATCH_DEFAULT_COUNT, DAILY_BATCH_MAX_COUNT),
  )
  const minScore = boundedInt(args.minScore, DAILY_BATCH_DEFAULT_MIN_SCORE, 100)
  const text = [
    `Bugungi yangiliklardan score ≥ ${minScore} bo'lgan ${count} tasini qayta yozib, tekshiruvga (review) yuboring.`,
    '',
    'Tartib:',
    `1. get_guidelines (yoki odya://guidelines/* resurslari) va get_glossary ni o'qing.`,
    `2. list_scraped(status: "scraped", minScore: ${minScore}, sort: "-score") — bugungi elementlar; ` +
      "kerak bo'lsa date (YYYY-MM-DD, Toshkent vaqti) bilan.",
    "3. Bir klasterdagi (clusterId bir xil) elementlardan faqat bittasini oling — qolganlari qo'shimcha manba sifatida.",
    '4. list_drafts bilan tekshiring: shu element uchun qoralama allaqachon bormi (takrorlamang).',
    `5. Har bir element uchun rewrite_article ish tartibi: create_draft → claim_draft → get_source → ` +
      'save_rewrite → set_seo → submit_for_review.',
    `6. ${count} ta post review'ga yuborilgach — qisqa hisobot: post ID'lari, sarlavhalar, muharrir uchun izohlar.`,
    '',
    'Publish qilmang — chop etishni faqat muharrir bajaradi. Shubhali yoki tasdiqlanmagan faktlar — notesForEditor ga.',
    '',
    UNTRUSTED_NOTICE,
  ].join('\n')
  return {
    description: `Kunlik batch: ${count} ta yangilik, score ≥ ${minScore}`,
    messages: [{ role: 'user', content: { type: 'text', text } }],
  }
}

export function registerGuidance(server: McpServer, ctx: McpContext): void {
  for (const entry of GUIDELINE_DOCS) {
    server.registerResource(
      `guidelines-${entry.id}`,
      entry.uri,
      {
        title: loadGuideline(entry.id).frontMatter.title,
        description: `Tahririyat ko'rsatmasi: ${entry.id} (packages/guidelines/${entry.file})`,
        mimeType: 'text/markdown',
      },
      async (uri) => {
        const doc = loadGuideline(entry.id)
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: doc.markdown }] }
      },
    )
  }

  server.registerResource(
    'glossary',
    GLOSSARY_URI,
    {
      title: 'Glossariy',
      description: "EN/RU atama → o'zbekcha (lotin); brendlar tarjima/transliteratsiya qilinmaydi",
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(await getGlossary(ctx.payload), null, 2),
        },
      ],
    }),
  )

  server.registerPrompt(
    'rewrite_article',
    {
      title: 'Maqolani qayta yozish',
      description:
        "Yig'ilgan elementni o'zbek tilida qayta yozish: ko'rsatmalar, glossariy va manba matni bilan.",
      argsSchema: rewriteArticleArgs,
    },
    (args) => rewriteArticlePrompt(ctx, args),
  )

  server.registerPrompt(
    'daily_batch',
    {
      title: 'Kunlik batch',
      description:
        `Bugungi eng yaxshi yangiliklarni qayta yozib review'ga yuborish (standart: ` +
        `${DAILY_BATCH_DEFAULT_COUNT} ta, score ≥ ${DAILY_BATCH_DEFAULT_MIN_SCORE}).`,
      argsSchema: dailyBatchArgs,
    },
    (args) => dailyBatchPrompt(args),
  )
}
