import { NotFoundView, notFoundMetadata } from '@/site/views/NotFoundView'

export const metadata = notFoundMetadata('uz-Cyrl')

export default function NotFoundPage() {
  return <NotFoundView locale="uz-Cyrl" />
}
