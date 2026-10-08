import { describe, expect, it } from 'vitest'

import { dailyBatchPrompt, submitStep } from '@/mcp/guidance'
import { getMcpRegistry } from '@/mcp/registry'
import { McpToolError } from '@/mcp/result'
import { formatTashkent, parsePublishAt, PUBLISH_AT_MAX_DAYS, scheduleView } from '@/mcp/schedule'
import { MCP_INSTRUCTIONS } from '@/mcp/server'

/** OBLOG-100: MCP `publishAt` — format, vaqt zonasi, chegaralar va agentga ko'rinadigan matnlar. */

// 2026-10-08 12:00 UTC = 17:00 Toshkent.
const NOW = Date.parse('2026-10-08T12:00:00Z')

const parse = (value: string) => parsePublishAt(value, NOW)

function rejects(value: string, pattern: RegExp) {
  let error: unknown
  try {
    parse(value)
  } catch (caught) {
    error = caught
  }
  expect(error, value).toBeInstanceOf(McpToolError)
  expect((error as Error).message, value).toMatch(pattern)
}

describe('parsePublishAt', () => {
  it('vaqt zonasi yozilmasa — Toshkent (UTC+05:00)', () => {
    expect(parse('2026-10-09T09:00').toISOString()).toBe('2026-10-09T04:00:00.000Z')
    expect(parse('2026-10-09 09:00:30').toISOString()).toBe('2026-10-09T04:00:30.000Z')
  })

  it('aniq zona: Z, +05:00, +0500, -03:00, millisekundlar', () => {
    expect(parse('2026-10-09T04:00:00Z').toISOString()).toBe('2026-10-09T04:00:00.000Z')
    expect(parse('2026-10-09t04:00z').toISOString()).toBe('2026-10-09T04:00:00.000Z')
    expect(parse('2026-10-09T09:00:00+05:00').toISOString()).toBe('2026-10-09T04:00:00.000Z')
    expect(parse('2026-10-09T09:00:00+0500').toISOString()).toBe('2026-10-09T04:00:00.000Z')
    expect(parse('2026-10-09T01:00:00.123-03:00').toISOString()).toBe('2026-10-09T04:00:00.000Z')
    expect(parse('  2026-10-09T09:00  ').toISOString()).toBe('2026-10-09T04:00:00.000Z')
  })

  it('noto‘g‘ri format va mavjud bo‘lmagan sana', () => {
    rejects('2026-10-09', /noto'g'ri format/)
    rejects('ertaga 9:00', /noto'g'ri format/)
    rejects('09.10.2026 09:00', /noto'g'ri format/)
    rejects('2026-10-09T9:00', /noto'g'ri format/)
    rejects('2026-02-30T09:00', /bunday sana\/vaqt yo'q/)
    rejects('2026-10-09T24:00', /bunday sana\/vaqt yo'q/)
    rejects('2026-10-09T09:00+15:00', /vaqt zonasi noto'g'ri/)
  })

  it('o‘tgan va juda yaqin vaqt rad etiladi (kamida 1 daqiqa)', () => {
    rejects('2026-10-08T16:00', /o'tgan yoki juda yaqin/)
    rejects('2026-10-08T12:00:30Z', /o'tgan yoki juda yaqin/)
    expect(parse('2026-10-08T12:01:00Z').toISOString()).toBe('2026-10-08T12:01:00.000Z')
  })

  it(`${PUBLISH_AT_MAX_DAYS} kundan uzoq — rad etiladi`, () => {
    expect(() => parse('2026-11-07T12:00:00Z')).not.toThrow()
    rejects('2026-11-07T12:00:01Z', /juda uzoq/)
    rejects('2027-01-01T09:00', /juda uzoq/)
  })
})

describe('formatTashkent / scheduleView', () => {
  it('Toshkent vaqti bilan o‘qiladigan ko‘rinish', () => {
    expect(formatTashkent(new Date('2026-10-09T04:00:00Z'))).toBe(
      '2026-10-09 09:00 (Toshkent, UTC+05:00)',
    )
    // Kun almashishi: 20:30 UTC → ertasi 01:30 Toshkent.
    expect(formatTashkent(new Date('2026-12-31T20:30:00Z'))).toBe(
      '2027-01-01 01:30 (Toshkent, UTC+05:00)',
    )
    expect(scheduleView('2026-10-09T04:00:00.000Z')).toEqual({
      scheduledAt: '2026-10-09T04:00:00.000Z',
      scheduledAtLocal: '2026-10-09 09:00 (Toshkent, UTC+05:00)',
    })
    expect(scheduleView(null)).toEqual({ scheduledAt: null, scheduledAtLocal: null })
  })
})

describe('agentga ko‘rinadigan matnlar (OBLOG-100)', () => {
  const registry = getMcpRegistry()
  const tool = (name: string) => registry.tools.find((item) => item.name === name)

  it('submit_for_review: publishAt ixtiyoriy argument, tavsifda "keyinroq" yo‘li', () => {
    const submit = tool('submit_for_review')!
    expect(submit.args.find((arg) => arg.name === 'publishAt')).toMatchObject({
      required: false,
      type: 'matn',
    })
    expect(submit.description).toContain('publishAt')
    expect(submit.description).toContain('list_scheduled')
  })

  it('list_scheduled (o‘qish), reschedule_post va cancel_schedule (yozish)', () => {
    expect(tool('list_scheduled')).toMatchObject({ group: 'read', readOnly: true })
    expect(tool('reschedule_post')).toMatchObject({ group: 'write', readOnly: false })
    expect(tool('reschedule_post')!.args.map((arg) => [arg.name, arg.required])).toEqual([
      ['postId', true],
      ['publishAt', true],
    ])
    expect(tool('cancel_schedule')!.args.map((arg) => [arg.name, arg.required])).toEqual([
      ['postId', true],
      ['reason', false],
    ])
  })

  it('server instructions va promptlar publishAt ni tushuntiradi', () => {
    expect(MCP_INSTRUCTIONS).toContain('publishAt')
    expect(submitStep(true)).toContain('publishAt')
    expect(submitStep(false)).toContain('publishAt')
    const text = dailyBatchPrompt({}, true).messages[0]?.content
    expect(text?.type === 'text' ? text.text : '').toContain('publishAt')
  })
})
