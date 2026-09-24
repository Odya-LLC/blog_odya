/**
 * Tekshirilgan muhit o'zgaruvchilari. Sxema va tekshiruv darajalari: `./env.schema.ts`.
 *
 * Runtime'da (`next start`, Vercel funksiyalari, `next dev`, migratsiya, testlar) birinchi
 * import paytida to'liq tekshiriladi — majburiy qiymat bo'lmasa ilova ishga tushmaydi.
 * `next build` paytida majburiy emas (build DB/S3 ga ulanmaydi), shuning uchun sirlarsiz
 * muhitda (masalan, Vercel Preview) ham build o'tadi.
 */
import { type Env, parseEnv } from './env.schema'

export * from './env.schema'

export const env: Env = parseEnv()
