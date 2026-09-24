'use client'

import { CheckIcon, LinkIcon } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

type CopyLinkButtonProps = {
  url: string
  label: string
  copiedLabel: string
  className?: string
}

/** Havolani nusxalash — ShareButtons ichidagi yagona client qism. */
export function CopyLinkButton({ url, label, copiedLabel, className }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API yo'q (http yoki eski brauzer) — tizim oynasi orqali.
      window.prompt(label, url)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? copiedLabel : label}
      title={label}
      className={cn(className)}
    >
      {copied ? <CheckIcon aria-hidden /> : <LinkIcon aria-hidden />}
      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </button>
  )
}
