import type { AdminViewServerProps, PayloadRequest } from 'payload'

import { loadMcpDoc, requestOrigin } from '@/mcp/docs'
import { getMcpRegistry } from '@/mcp/registry'

import { CopyButton } from './CopyButton'
import { EditorialShell } from './EditorialShell'
import { McpDocContent } from './McpDocContent'

/**
 * "MCP qo'llanma" (OBLOG-43) — `/admin/mcp`: AI agentni ulash va ishlatish bo'yicha to'liq
 * hujjat. Matn — `docs/mcp.md` (bitta manba), jadvallar — MCP reestridan. Ruxsat — admin/editor
 * (`EditorialShell`). Faqat admin bundle'ida — ommaviy sayt JS'iga ta'sir qilmaydi.
 */
export function McpDocsView(props: AdminViewServerProps) {
  return (
    <EditorialShell props={props} path="/mcp" label="MCP qo‘llanma">
      <McpDocs req={props.initPageResult.req} />
    </EditorialShell>
  )
}

/** Joriy foydalanuvchi API kaliti yoqilganmi (kalitning o'zi o'qilmaydi va ko'rsatilmaydi). */
async function apiKeyEnabled(req: PayloadRequest): Promise<boolean> {
  if (!req.user || req.user.collection !== 'users') return false
  const user = await req.payload.findByID({
    collection: 'users',
    id: req.user.id,
    select: { enableAPIKey: true },
    overrideAccess: false,
    req,
  })
  return user?.enableAPIKey === true
}

async function McpDocs({ req }: { req: PayloadRequest }) {
  const adminRoute = req.payload.config.routes.admin
  const origin = requestOrigin(req.headers, req.payload.config.serverURL)
  const endpoint = `${origin}/api/mcp`
  const keyEnabled = await apiKeyEnabled(req)
  const profileHref = req.user ? `${adminRoute}/collections/users/${req.user.id}` : adminRoute

  return (
    <>
      <header className="editorial__header">
        <h1>MCP qo‘llanma</h1>
        <span className="editorial__muted">Claude Code / Claude Desktop agentini ulash</span>
      </header>

      <section className="mcp-doc__status" data-testid="mcp-status">
        <div>
          <span className="editorial__muted">Server manzili</span>
          <div className="mcp-doc__endpoint">
            <code data-testid="mcp-endpoint">{endpoint}</code>
            <CopyButton value={endpoint} />
          </div>
          <a href="/api/mcp" target="_blank" rel="noreferrer">
            Holatni tekshirish (GET /api/mcp)
          </a>
        </div>
        <div>
          <span className="editorial__muted">Sizning API kalitingiz</span>
          <div data-testid="mcp-key-status">
            {keyEnabled ? (
              <span className="editorial__pill editorial__pill--agent">Yoqilgan</span>
            ) : (
              <span className="editorial__pill editorial__pill--rejected">Yoqilmagan</span>
            )}
          </div>
          <a href={profileHref}>Profil → API kalit</a>
        </div>
      </section>

      <McpDocContent markdown={loadMcpDoc()} origin={origin} registry={getMcpRegistry()} />
    </>
  )
}
