import { NotFoundView, notFoundMetadata } from '@/site/views/NotFoundView'

export const metadata = notFoundMetadata('uz-Latn')

export default function NotFoundPage() {
  return <NotFoundView locale="uz-Latn" />
}
