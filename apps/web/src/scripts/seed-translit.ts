/**
 * `pnpm seed:translit` — transliteratsiya istisnolari va glossariy seed'i (idempotent).
 * `payload run` orqali ishga tushadi (env — apps/web/.env).
 */
import config from '@payload-config'
import { getPayload } from 'payload'

import { seedTranslitDictionaries } from '@/seed/translit'

const payload = await getPayload({ config })
try {
  const result = await seedTranslitDictionaries(payload)
  payload.logger.info(
    `translit-exceptions: +${result.translitExceptions.created} (mavjud: ${result.translitExceptions.skipped}); ` +
      `glossary: +${result.glossary.created} (mavjud: ${result.glossary.skipped})`,
  )
} finally {
  await payload.destroy()
}
process.exit(0)
