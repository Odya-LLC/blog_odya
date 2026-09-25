import type { Nodes, RootContent, Table } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import type React from 'react'

import { formatArg, MCP_DOC_END, MCP_DOC_START, withOrigin } from '@/mcp/docs'
import type { McpArgInfo, McpRegistry, McpToolInfo } from '@/mcp/registry'

import { CopyButton } from './CopyButton'

/**
 * `docs/mcp.md` → React (server komponent, OBLOG-43). Faqat hujjatda ishlatiladigan Markdown
 * tugunlari; xom HTML chiqarilmaydi. Server manzili joriy domenga almashtiriladi, kod bloklarida
 * nusxalash tugmasi. `mcp-registry` markerlari o'rniga jadvallar to'g'ridan-to'g'ri reestrdan.
 */

interface RenderContext {
  origin: string
  registry: McpRegistry
}

const SAFE_HREF = /^(https?:\/\/|mailto:|\/|#)/i

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9ʻʼ'\s-]/g, '')
    .trim()
    .replace(/[\s'ʻʼ]+/g, '-')
}

function plainText(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') return node.value
  if ('children' in node) return node.children.map((child) => plainText(child as Nodes)).join('')
  return ''
}

function renderChildren(nodes: readonly Nodes[], ctx: RenderContext): React.ReactNode[] {
  return nodes.map((node, index) => renderNode(node, ctx, index))
}

function renderTable(node: Table, ctx: RenderContext, key: number) {
  const [head, ...rows] = node.children
  return (
    <div key={key} className="mcp-doc__table">
      <table>
        {head && (
          <thead>
            <tr>
              {head.children.map((cell, index) => (
                <th key={index}>{renderChildren(cell.children, ctx)}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.children.map((cell, index) => (
                <td key={index}>{renderChildren(cell.children, ctx)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function renderNode(node: Nodes, ctx: RenderContext, key: number): React.ReactNode {
  switch (node.type) {
    case 'root':
      return renderChildren(node.children, ctx)
    case 'heading': {
      const Tag = `h${Math.min(Math.max(node.depth, 2), 4)}` as 'h2' | 'h3' | 'h4'
      return (
        <Tag key={key} id={node.depth === 2 ? slugifyHeading(plainText(node)) : undefined}>
          {renderChildren(node.children, ctx)}
        </Tag>
      )
    }
    case 'paragraph':
      return <p key={key}>{renderChildren(node.children, ctx)}</p>
    case 'text':
      return withOrigin(node.value, ctx.origin)
    case 'strong':
      return <strong key={key}>{renderChildren(node.children, ctx)}</strong>
    case 'emphasis':
      return <em key={key}>{renderChildren(node.children, ctx)}</em>
    case 'delete':
      return <del key={key}>{renderChildren(node.children, ctx)}</del>
    case 'inlineCode':
      return <code key={key}>{withOrigin(node.value, ctx.origin)}</code>
    case 'break':
      return <br key={key} />
    case 'thematicBreak':
      return <hr key={key} />
    case 'code': {
      const value = withOrigin(node.value, ctx.origin)
      return (
        <div key={key} className="mcp-doc__code">
          <CopyButton value={value} />
          <pre>
            <code>{value}</code>
          </pre>
        </div>
      )
    }
    case 'blockquote':
      return <blockquote key={key}>{renderChildren(node.children, ctx)}</blockquote>
    case 'list': {
      const children = node.children.map((item, index) => (
        <li key={index}>
          {item.children.map((child, childIndex) =>
            // "Tight" ro'yxatlarda abzas <p> siz chiqariladi.
            child.type === 'paragraph' && !node.spread ? (
              <span key={childIndex}>{renderChildren(child.children, ctx)}</span>
            ) : (
              renderNode(child, ctx, childIndex)
            ),
          )}
        </li>
      ))
      return node.ordered ? (
        <ol key={key} start={node.start ?? undefined}>
          {children}
        </ol>
      ) : (
        <ul key={key}>{children}</ul>
      )
    }
    case 'link': {
      const href = withOrigin(node.url, ctx.origin)
      const children = renderChildren(node.children, ctx)
      if (!SAFE_HREF.test(href)) return <span key={key}>{children}</span>
      return (
        <a key={key} href={href} rel="noreferrer">
          {children}
        </a>
      )
    }
    case 'table':
      return renderTable(node, ctx, key)
    default:
      // html, image, definition va h.k. — chiqarilmaydi.
      return null
  }
}

function ArgList({ args }: { args: McpArgInfo[] }) {
  if (args.length === 0) return <span className="editorial__muted">—</span>
  return (
    <ul className="mcp-doc__args">
      {args.map((arg) => (
        <li key={arg.name}>
          <code>{formatArg(arg)}</code>
          {arg.description ? <span className="editorial__muted"> — {arg.description}</span> : null}
        </li>
      ))}
    </ul>
  )
}

function ToolTable({ tools, testId }: { tools: McpToolInfo[]; testId: string }) {
  return (
    <div className="mcp-doc__table">
      <table data-testid={testId}>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Vazifasi</th>
            <th>Argumentlar (? — ixtiyoriy)</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr key={tool.name} data-testid="mcp-tool-row">
              <td>
                <code>{tool.name}</code>
              </td>
              <td>
                <strong>{tool.title}.</strong> {tool.description}
              </td>
              <td>
                <ArgList args={tool.args} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function McpRegistryTables({ registry }: { registry: McpRegistry }) {
  const read = registry.tools.filter((tool) => tool.group === 'read')
  const write = registry.tools.filter((tool) => tool.group === 'write')
  const media = registry.tools.filter((tool) => tool.group === 'media')
  return (
    <>
      <p>
        Jami: {registry.tools.length} ta tool, {registry.prompts.length} ta prompt,{' '}
        {registry.resources.length} ta resource (MCP server reestridan).
      </p>
      <h3>O‘qish toollari ({read.length})</h3>
      <ToolTable tools={read} testId="mcp-read-tools" />
      <h3>Yozish toollari ({write.length})</h3>
      <ToolTable tools={write} testId="mcp-write-tools" />
      <h3>Media toollari ({media.length})</h3>
      <ToolTable tools={media} testId="mcp-media-tools" />
      <h3>Prompts ({registry.prompts.length})</h3>
      <div className="mcp-doc__table">
        <table data-testid="mcp-prompts">
          <thead>
            <tr>
              <th>Prompt</th>
              <th>Vazifasi</th>
              <th>Argumentlar</th>
            </tr>
          </thead>
          <tbody>
            {registry.prompts.map((prompt) => (
              <tr key={prompt.name}>
                <td>
                  <code>{prompt.name}</code>
                </td>
                <td>
                  <strong>{prompt.title}.</strong> {prompt.description}
                </td>
                <td>
                  <ArgList args={prompt.args} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Resources ({registry.resources.length})</h3>
      <div className="mcp-doc__table">
        <table data-testid="mcp-resources">
          <thead>
            <tr>
              <th>URI</th>
              <th>Nomi</th>
              <th>Vazifasi</th>
            </tr>
          </thead>
          <tbody>
            {registry.resources.map((resource) => (
              <tr key={resource.uri}>
                <td>
                  <code>{resource.uri}</code>
                </td>
                <td>{resource.title}</td>
                <td>{resource.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/**
 * Hujjat bo'limlari: birinchi `##` sarlavhadan boshlab (sarlavha va texnik kirish qismi
 * admin sahifasida ko'rsatilmaydi). Markerlar orasi — reestr jadvallari.
 */
export function McpDocContent({
  markdown,
  origin,
  registry,
}: {
  markdown: string
  origin: string
  registry: McpRegistry
}) {
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })
  const ctx: RenderContext = { origin, registry }
  const firstSection = tree.children.findIndex(
    (node) => node.type === 'heading' && node.depth === 2,
  )
  const nodes = tree.children.slice(Math.max(firstSection, 0))

  const out: React.ReactNode[] = []
  const toc: { id: string; text: string }[] = []
  let inRegistry = false
  nodes.forEach((node: RootContent, index) => {
    if (node.type === 'html' && node.value.startsWith(MCP_DOC_START)) {
      inRegistry = true
      out.push(<McpRegistryTables key={`registry-${index}`} registry={registry} />)
      return
    }
    if (inRegistry) {
      if (node.type === 'html' && node.value.trim() === MCP_DOC_END) inRegistry = false
      return
    }
    if (node.type === 'heading' && node.depth === 2) {
      const text = plainText(node)
      toc.push({ id: slugifyHeading(text), text })
    }
    out.push(renderNode(node, ctx, index))
  })

  return (
    <div className="mcp-doc">
      <nav className="mcp-doc__toc" aria-label="Bo‘limlar">
        <ul>
          {toc.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.text}</a>
            </li>
          ))}
        </ul>
      </nav>
      {out}
    </div>
  )
}
