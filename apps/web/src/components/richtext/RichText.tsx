import type { Locale } from '@blog-odya/shared'
import {
  type JSXConverters,
  type JSXConvertersFunction,
  LinkJSXConverter,
  RichText as PayloadRichText,
} from '@payloadcms/richtext-lexical/react'
import type { ReactNode } from 'react'

import { StaticImage as Image } from '@/components/blog/StaticImage'
import { encodeMediaSrc } from '@/lib/media-image'
import type { Media } from '@/payload-types'
import { categoryPath, pagePath, postPath, tagPath } from '@/site/paths'

import { Embed } from './Embed'

type SerializedNode = { type: string; children?: SerializedNode[]; [key: string]: unknown }

type LexicalData = { root: { children: unknown[]; [key: string]: unknown }; [key: string]: unknown }

type RichTextProps = {
  data: LexicalData | null | undefined
  locale: Locale
}

type Doc = { slug?: string | null; category?: unknown }

function asDoc(value: unknown): Doc | null {
  return value !== null && typeof value === 'object' ? (value as Doc) : null
}

/** Ichki havola (Lexical `linkType: internal`) → joriy yozuvdagi sayt URL'i. */
function internalHref(locale: Locale, relationTo: string, value: unknown): string {
  const doc = asDoc(value)
  if (!doc?.slug) return '#'
  switch (relationTo) {
    case 'posts': {
      const category = asDoc(doc.category)
      return category?.slug ? postPath(locale, category.slug, doc.slug) : '#'
    }
    case 'categories':
      return categoryPath(locale, doc.slug)
    case 'tags':
      return tagPath(locale, doc.slug)
    case 'pages':
      return pagePath(locale, doc.slug)
    default:
      return '#'
  }
}

/** Jadval: birinchi qator sarlavha katakchalaridan iborat bo'lsa — `<thead>` (a11y). */
function renderTable(
  node: SerializedNode,
  nodesToJSX: (args: { nodes: SerializedNode[] }) => ReactNode[],
): ReactNode {
  const rows = (node.children ?? []).filter((row) => row.type === 'tablerow')
  const [first, ...rest] = rows
  const isHeaderRow = (row?: SerializedNode) =>
    Boolean(row?.children?.length) &&
    row!.children!.every((cell) => Number(cell.headerState ?? 0) > 0)
  const hasHead = isHeaderRow(first)
  const renderRows = (list: SerializedNode[]) => list.map((row) => nodesToJSX({ nodes: [row] }))
  return (
    <table>
      {hasHead ? <thead>{renderRows([first!])}</thead> : null}
      <tbody>{renderRows(hasHead ? rest : rows)}</tbody>
    </table>
  )
}

function buildConverters(locale: Locale): JSXConvertersFunction {
  return ({ defaultConverters }) =>
    ({
      ...defaultConverters,
      ...LinkJSXConverter({
        internalDocToHref: ({ linkNode }) => {
          const doc = linkNode.fields.doc
          return doc ? internalHref(locale, doc.relationTo, doc.value) : '#'
        },
      }),
      table: ({ node, nodesToJSX }) =>
        renderTable(node as unknown as SerializedNode, nodesToJSX as never),
      tablerow: ({ node, nodesToJSX }) => <tr>{nodesToJSX({ nodes: node.children })}</tr>,
      tablecell: ({ node, nodesToJSX }) => {
        const Cell = node.headerState > 0 ? 'th' : 'td'
        return (
          <Cell
            colSpan={node.colSpan && node.colSpan > 1 ? node.colSpan : undefined}
            rowSpan={node.rowSpan && node.rowSpan > 1 ? node.rowSpan : undefined}
            scope={node.headerState === 1 ? 'col' : node.headerState === 2 ? 'row' : undefined}
          >
            {nodesToJSX({ nodes: node.children })}
          </Cell>
        )
      },
      upload: ({ node }) => {
        const media = (node as { value?: unknown }).value
        if (!media || typeof media !== 'object') return null
        const doc = media as Media
        if (!doc.mimeType?.startsWith('image/')) return null
        const src = encodeMediaSrc(doc)
        if (!src || !doc.width || !doc.height) return null
        const caption = doc.caption || doc.credit
        return (
          <figure>
            <Image
              src={src}
              alt={doc.alt ?? ''}
              width={doc.width}
              height={doc.height}
              sizes="(min-width: 720px) 680px, 100vw"
              className="h-auto w-full"
            />
            {caption ? <figcaption>{caption}</figcaption> : null}
          </figure>
        )
      },
      blocks: {
        Code: ({ node }) => {
          const { code, language } = node.fields as { code?: string; language?: string }
          if (!code) return null
          return (
            <pre data-language={language || undefined}>
              <code className={language ? `language-${language}` : undefined}>{code}</code>
            </pre>
          )
        },
        embed: ({ node }) => {
          const { url, caption } = node.fields as { url?: string; caption?: string | null }
          return url ? <Embed url={url} caption={caption} locale={locale} /> : null
        },
      },
    }) as JSXConverters
}

/**
 * Lexical → JSX renderer (maqola matni, TZ §10.3): paragraf, sarlavhalar, ro'yxat, havola,
 * iqtibos, rasm (media — custom loader bilan WebP variantlar), kod, jadval, embed.
 * Tipografiya — `ArticleBody` (`prose-odya`).
 */
export function RichText({ data, locale }: RichTextProps) {
  if (!data?.root) return null
  return (
    <PayloadRichText
      data={data as never}
      converters={buildConverters(locale)}
      disableContainer
      disableIndent
    />
  )
}
