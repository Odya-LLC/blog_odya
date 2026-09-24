import { HomeView } from '@/site/views/HomeView'

/** ISR: teg bo'yicha yangilanadi (publish/unpublish), zaxira — 1 soat. */
export const revalidate = 3600

export default function HomePage() {
  return <HomeView locale="uz-Latn" />
}
