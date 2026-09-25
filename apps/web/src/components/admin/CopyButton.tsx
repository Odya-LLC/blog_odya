'use client'

import { useState } from 'react'

/** Nusxalash tugmasi (MCP qo'llanmasidagi buyruq va konfiguratsiyalar uchun). */
export function CopyButton({ value, label = 'Nusxalash' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button type="button" className="mcp-doc__copy" onClick={copy} data-testid="mcp-copy">
      {state === 'copied' ? 'Nusxalandi' : state === 'failed' ? 'Nusxalab bo‘lmadi' : label}
    </button>
  )
}
