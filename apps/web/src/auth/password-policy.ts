import { type CollectionBeforeValidateHook, ValidationError } from 'payload'

/**
 * Kuchli parol qoidasi (TZ §9.2, OBLOG-23) — `users` yaratish/yangilash (admin forma, REST,
 * Local API, birinchi foydalanuvchi):
 * - kamida 12 belgi;
 * - kichik va katta harf, raqam (harflar — lotin yoki kirill);
 * - email yoki uning `@` gacha qismini o'z ichiga olmaydi;
 * - bir xil belgining uzun takrori emas (`aaaaaaaaaaaa`).
 *
 * Eslatma: Payload'ning "parolni tiklash" (`reset-password`) operatsiyasi collection hook'larini
 * parol bilan chaqirmaydi — u yerda faqat Payload'ning standart tekshiruvi. Email adapter
 * sozlanmagan, shuning uchun tiklash havolasi yuborilmaydi (parolni admin o'rnatadi).
 */
export const PASSWORD_MIN_LENGTH = 12

export function validatePassword(password: string, email?: string | null): string[] {
  const errors: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Parol kamida ${PASSWORD_MIN_LENGTH} belgidan iborat bo‘lishi kerak.`)
  }
  if (!/\p{Ll}/u.test(password)) errors.push('Parolda kamida bitta kichik harf bo‘lishi kerak.')
  if (!/\p{Lu}/u.test(password)) errors.push('Parolda kamida bitta katta harf bo‘lishi kerak.')
  if (!/\p{Nd}/u.test(password)) errors.push('Parolda kamida bitta raqam bo‘lishi kerak.')
  if (/^(.)\1+$/u.test(password)) errors.push('Parol bir xil belgilardan iborat bo‘lmasligi kerak.')

  const normalizedEmail = email?.trim().toLowerCase()
  if (normalizedEmail) {
    const lower = password.toLowerCase()
    const local = normalizedEmail.split('@')[0] ?? ''
    if (lower.includes(normalizedEmail) || (local.length >= 4 && lower.includes(local))) {
      errors.push('Parolda email manzil bo‘lmasligi kerak.')
    }
  }
  return errors
}

/**
 * `beforeValidate` hook: `data.password` berilgandagina tekshiradi (parol o'zgarmasa — hech
 * narsa). Email — yangi qiymat yoki mavjud hujjatdagi.
 */
export const enforcePasswordPolicy: CollectionBeforeValidateHook = ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  const password: unknown = data?.password
  if (typeof password !== 'string' || password === '') return data
  const email = (data?.email as string | undefined) ?? (originalDoc?.email as string | undefined)
  const errors = validatePassword(password, email)
  if (errors.length) {
    throw new ValidationError(
      {
        collection: collection?.slug,
        errors: [{ message: errors.join(' '), path: 'password' }],
        req,
      },
      req.t,
    )
  }
  return data
}
