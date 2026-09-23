import { DEFAULT_LOCALE } from '@blog-odya/shared'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="home">
      <div className="content">
        <h1>Blog Odya</h1>
        <p>AI, IT, texnologiya va kibersport yangiliklari o&apos;zbek tilida. Tez orada.</p>
        <div className="links">
          <Link className="admin" href="/admin">
            Admin panel
          </Link>
        </div>
      </div>
      <div className="footer">
        <p>
          Asosiy yozuv: <code>{DEFAULT_LOCALE}</code>
        </p>
      </div>
    </div>
  )
}
