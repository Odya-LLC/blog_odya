/**
 * Tahririyat ko'rsatmalari (stil qo'llanma, glossariy, SEO qoidalari).
 * Mazmuni M0-05 (OBLOG-6) vazifasida to'ldiriladi va MCP server orqali
 * prompt/resource sifatida beriladi (TZ §5.2).
 */
export interface Guideline {
  /** MCP resource identifikatori, masalan `guidelines://style` */
  uri: string
  title: string
  markdown: string
}

export const guidelines: readonly Guideline[] = []
