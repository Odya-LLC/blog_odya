/**
 * `pnpm seed` — boshlang'ich ma'lumotlarni yuklash (`payload run` orqali, avval `pnpm migrate`).
 * Takror ishga tushirish xavfsiz: mavjud hujjatlar o'zgartirilmaydi, dublikat yaratilmaydi.
 *
 * `SEED_DEMO=false` — demo kontentsiz (teglar, postlar, muqovalar yo'q; S3 ga hech narsa
 * yuklanmaydi). Prod: `gh workflow run seed-prod` (`.github/workflows/seed-prod.yml`).
 */
import { getPayload } from 'payload'

import config from '../payload.config'

import { parseSeedDemo, seed } from './index'

const payload = await getPayload({ config: await config })
let exitCode = 0
try {
  const summary = await seed(payload, {
    demo: parseSeedDemo(process.env.SEED_DEMO),
    log: (message) => payload.logger.info(message),
  })
  payload.logger.info(`Seed tugadi: ${JSON.stringify(summary)}`)
} catch (error) {
  payload.logger.error({ err: error, msg: 'Seed xatosi' })
  exitCode = 1
} finally {
  await payload.destroy()
}
process.exit(exitCode)
