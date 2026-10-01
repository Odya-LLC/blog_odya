import { loadGuideline } from '@blog-odya/guidelines'
import { describe, expect, it } from 'vitest'

import { dailyBatchPrompt, submitStep } from '@/mcp/guidance'
import { getMcpRegistry } from '@/mcp/registry'
import { MCP_INSTRUCTIONS } from '@/mcp/server'
import { holdReason } from '@/mcp/write-tools'

/**
 * OBLOG-62: avtomatik nashr ostidagi qoidalar agentga ko'rinadigan barcha joylarda bir xil —
 * ko'rsatmalar (`get_guidelines` / `odya://guidelines/output-schema`), server instructions, tool
 * tavsiflari va promptlar. Eski "faqat inson chop etadi" matni qolmasligi kerak.
 */
describe('avtomatik nashr: ushlab qolish qoidasi', () => {
  it('ustuvorlik: autoPublish: false → needsHumanReview → notesForEditor', () => {
    expect(holdReason({ notes: '' })).toBeNull()
    expect(holdReason({ notes: '', autoPublish: true, needsHumanReview: false })).toBeNull()
    expect(holdReason({ notes: 'x' })).toBe('notes_for_editor')
    expect(holdReason({ notes: 'x', needsHumanReview: true })).toBe('needs_human_review')
    expect(holdReason({ notes: 'x', needsHumanReview: true, autoPublish: false })).toBe(
      'agent_opt_out',
    )
  })
})

describe('avtomatik nashr: hujjatlar va tavsiflar (OBLOG-62)', () => {
  it('output-schema v1.4.0 ikkala rejimni tavsiflaydi', () => {
    const doc = loadGuideline('output-schema')
    expect(doc.frontMatter.version).toBe('1.4.0')
    expect(doc.frontMatter.updatedAt).toBe('2026-10-02')
    expect(doc.markdown).not.toMatch(/chop etishni faqat inson bajaradi/)
    expect(doc.markdown).toContain('shu chaqiruvning oʻzida')
    for (const term of [
      'needsHumanReview',
      'heldForReview',
      'notes_for_editor',
      'withdraw_from_review',
      'Chop etilgan postni tuzatish',
    ]) {
      expect(doc.markdown, term).toContain(term)
    }
  })

  it('server instructions — rejimga bog‘liq, eski "publish yo‘q" matnisiz', () => {
    expect(MCP_INSTRUCTIONS).not.toMatch(/Publish qilish imkoni yo/)
    expect(MCP_INSTRUCTIONS).toContain('SHU CHAQIRUVDA')
    expect(MCP_INSTRUCTIONS).toContain('needsHumanReview')
    expect(MCP_INSTRUCTIONS).toContain('withdraw_from_review')
  })

  it('submit_for_review tavsifi va argumentlari', () => {
    const registry = getMcpRegistry()
    const submit = registry.tools.find((tool) => tool.name === 'submit_for_review')!
    expect(submit.description).toMatch(/SHU CHAQIRUVNING O‘ZIDA/)
    expect(submit.description).toContain('heldForReview')
    expect(submit.args.map((arg) => [arg.name, arg.required])).toEqual([
      ['postId', true],
      ['notesForEditor', false],
      ['needsHumanReview', false],
      ['autoPublish', false],
    ])
    const withdraw = registry.tools.find((tool) => tool.name === 'withdraw_from_review')!
    expect(withdraw).toMatchObject({ group: 'write', readOnly: false })
  })

  it('promptlar: yoqilgan rejimda izohli post chop etilmasligi aytiladi', () => {
    expect(submitStep(true)).toContain('heldForReview')
    const message = dailyBatchPrompt({}, true).messages[0]
    const text = message?.content.type === 'text' ? message.content.text : ''
    expect(text).toContain('needsHumanReview')
    expect(text).toContain('review da qolganlari')
  })
})
