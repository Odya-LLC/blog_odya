import { describe, expect, it } from 'vitest'

import { validatePassword } from '@/auth/password-policy'
import { LOCK_TIME_MS, MAX_LOGIN_ATTEMPTS, Users } from '@/collections/Users'

/** Kuchli parol va kirishni bloklash (OBLOG-23, TZ §9.2). */
describe('parol qoidasi', () => {
  it('kuchli parol o‘tadi (lotin va kirill harflar)', () => {
    expect(validatePassword('Test-parol-123456', 'admin@odya.uz')).toEqual([])
    expect(validatePassword('Кучли-Парол-2026', 'admin@odya.uz')).toEqual([])
  })

  it('qisqa, harf/raqam turlari yetishmaydi', () => {
    expect(validatePassword('Qisqa-12')).toHaveLength(1)
    expect(validatePassword('faqatkichikharf1')[0]).toContain('katta harf')
    expect(validatePassword('FAQATKATTAHARF1')[0]).toContain('kichik harf')
    expect(validatePassword('RaqamsizParolXyz')[0]).toContain('raqam')
  })

  it('email yoki uning nomi parolda bo‘lmasin', () => {
    expect(validatePassword('Odilkhon@odya.uz1', 'odilkhon@odya.uz')).toContain(
      'Parolda email manzil bo‘lmasligi kerak.',
    )
    expect(validatePassword('Odilkhon-2026-X', 'odilkhon@odya.uz')).toContain(
      'Parolda email manzil bo‘lmasligi kerak.',
    )
  })

  it('users: 5 urinish, 15 daqiqa blok', () => {
    expect(MAX_LOGIN_ATTEMPTS).toBe(5)
    expect(LOCK_TIME_MS).toBe(15 * 60 * 1000)
    expect(Users.auth).toMatchObject({ maxLoginAttempts: 5, lockTime: 900_000 })
  })
})
