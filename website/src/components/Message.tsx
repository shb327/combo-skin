import type { ReactNode } from 'react'

/** A centred message under a page's header, with an optional action below it. */
export function Message({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] md:min-h-[400px]">
      <p className="text-white/40 text-base md:text-lg">{text}</p>
      {children}
    </div>
  )
}
