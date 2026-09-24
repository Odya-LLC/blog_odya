import { SearchXIcon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type EmptyStateProps = {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  /** Tugma/havola (masalan, "Bosh sahifaga qaytish"). */
  action?: ReactNode
  className?: string
}

/** Bo'sh holat: bo'sh qidiruv, maqolasiz kategoriya/teg (TZ §12.3). */
export function EmptyState({
  title,
  description,
  icon: Icon = SearchXIcon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-surface-muted text-muted">
        <Icon className="size-7" aria-hidden />
      </span>
      <p className="font-display text-xl font-bold text-fg">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
