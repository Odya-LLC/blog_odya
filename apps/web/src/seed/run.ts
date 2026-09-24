/**
 * `pnpm seed` — boshlang'ich ma'lumotlarni yuklash (`payload run` orqali, avval `pnpm migrate`).
 * Takror ishga tushirish xavfsiz: mavjud hujjatlar o'zgartirilmaydi, dublikat yaratilmaydi.
 */
import { getPayload } from 'payload'

import config from '../payload.config'

import { seed } from './index'

const payload = await getPayload({ config: await config })
let exitCode = 0
try {
  const summary = await seed(payload, { log: (message) => payload.logger.info(message) })
  payload.logger.info(`Seed tugadi: ${JSON.stringify(summary)}`)
} catch (error) {
  payload.logger.error({ err: error, msg: 'Seed xatosi' })
  exitCode = 1
} finally {
  await payload.destroy()
}
process.exit(exitCode)
