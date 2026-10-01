/**
 * `pnpm --filter @blog-odya/web cyrl:resync` — chop etilgan postlarning kirill versiyasini joriy
 * transliteratsiya qoidalari va lug'atlari bilan qayta yaratish (OBLOG-67). `payload run` orqali
 * (env — apps/web/.env; prod — `gh workflow run cyrl-resync`).
 *
 * Standart — **dry-run** (hech narsa yozilmaydi, faqat hisobot). Argumentlar (pozitsion —
 * `payload run` `--flag` larni o'tkazmaydi): `apply` (yozish), `ids=220,221` (faqat shu postlar),
 * `filter=ai` (faqat AI agent/MCP qayta yozgan postlar; standart — barcha chop etilganlar),
 * `limit=N`. Qo'lda tuzatilgan (`cyrlLocked`) maydonlar o'zgarmaydi; Telegram xabarlari
 * tahrirlanmaydi; sayt sahifalari ISR muddati (≤ 1 soat) ichida yangilanadi. Masalan:
 * `pnpm --filter @blog-odya/web cyrl:resync filter=ai` → `... cyrl:resync filter=ai apply`.
 */
import { getPayload } from 'payload'

import config from '../payload.config'
import { formatResyncSummary, resyncPostsCyrillic } from '../translit/resync'

const args = process.argv.slice(2).map((value) => value.replace(/^--/, ''))

function value(name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1)
}

const ids = (value('ids') ?? '')
  .split(',')
  .map((id) => Number(id.trim()))
  .filter((id) => Number.isInteger(id) && id > 0)
const limit = Number(value('limit'))
const filter = value('filter') === 'ai' ? 'ai' : 'all'
const apply = args.includes('apply')

const payload = await getPayload({ config: await config })
let exitCode = 0
try {
  const summary = await resyncPostsCyrillic(payload, {
    apply,
    filter,
    ...(ids.length ? { ids } : {}),
    ...(Number.isInteger(limit) && limit > 0 ? { limit } : {}),
    log: (message) => payload.logger.info(message),
  })
  for (const line of formatResyncSummary(summary).split('\n')) payload.logger.info(line)
  if (summary.failed > 0) exitCode = 1
} catch (error) {
  payload.logger.error({ err: error, msg: 'cyrl:resync xatosi' })
  exitCode = 1
} finally {
  await payload.destroy()
}
process.exit(exitCode)
