import type { Access, FieldAccess, PayloadRequest } from 'payload'

/**
 * Rollar va access helper'lar (TZ §4.2): ikki rol — `admin` va `editor`.
 * Kelajakda `author` roli qo'shilsa, shu yerga qo'shiladi va helper'lar kengaytiriladi.
 */
export const ROLES = ['admin', 'editor'] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  editor: 'Muharrir',
}

type MaybeUser = PayloadRequest['user'] | null | undefined

function roleOf(user: MaybeUser): Role | undefined {
  if (!user || user.collection !== 'users') return undefined
  const role = (user as { role?: unknown }).role
  return typeof role === 'string' && (ROLES as readonly string[]).includes(role)
    ? (role as Role)
    : undefined
}

export function hasRole(user: MaybeUser, ...roles: Role[]): boolean {
  const role = roleOf(user)
  return role !== undefined && roles.includes(role)
}

export const isAdminUser = (user: MaybeUser): boolean => hasRole(user, 'admin')

export const isAdminOrEditorUser = (user: MaybeUser): boolean => hasRole(user, 'admin', 'editor')

/** Kolleksiya darajasida: faqat admin. */
export const isAdmin: Access = ({ req }) => isAdminUser(req.user)

/** Kolleksiya darajasida: admin yoki editor. */
export const isAdminOrEditor: Access = ({ req }) => isAdminOrEditorUser(req.user)

/** Admin — hamma hujjatlar; editor — faqat o'zi (masalan, o'z profili va API kaliti). */
export const isAdminOrSelf: Access = ({ req }) => {
  if (isAdminUser(req.user)) return true
  if (isAdminOrEditorUser(req.user) && req.user) return { id: { equals: req.user.id } }
  return false
}

/** Maydon darajasida: faqat admin (masalan, `role` ni o'zgartirish). */
export const isAdminFieldLevel: FieldAccess = ({ req }) => isAdminUser(req.user)
