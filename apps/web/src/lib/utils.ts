import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui uslubidagi klass birlashtirish: shartli klasslar + Tailwind ziddiyatlarini hal qilish. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
