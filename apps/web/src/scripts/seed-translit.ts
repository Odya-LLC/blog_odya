/**
 * `pnpm --filter @blog-odya/web seed:translit` — transliteratsiya istisnolari va glossariy seed'i
 * (idempotent; umumiy `pnpm seed` ham chaqiradi). `payload run` orqali (env — apps/web/.env).
 */
import { getPayload } from 'payload'

import config from '../payload.config'
import { seedTranslitDictionaries } from '../seed/translit'

const payload = await getPayload({ config: await config })
let exitCode = 0
try {
  const result = await seedTranslitDictionaries(payload)
  payload.logger.info(
    `translit-exceptions: +${result.translitExceptions.created} (mavjud: ${result.translitExceptions.skipped}); ` +
      `glossary: +${result.glossary.created} (mavjud: ${result.glossary.skipped})`,
  )
} catch (error) {
  payload.logger.error({ err: error, msg: 'seed:translit xatosi' })
  exitCode = 1
} finally {
  await payload.destroy()
}
process.exit(exitCode)
