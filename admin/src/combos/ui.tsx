/** Small pieces shared by the combo screens. */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { errorMessage } from '../api/errors'
import type { ComboStatus } from './queries'
import { PRIMARY, SECONDARY } from './styles'

const STATUS: Record<ComboStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-white/30 text-white/80' },
  published: { label: 'Published', className: 'border-accent text-accent' },
  unpublished: { label: 'Unpublished', className: 'border-white/15 text-white/50' },
}

export function StatusBadge({ status }: { status: ComboStatus }) {
  const { label, className } = STATUS[status]
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${className}`}>{label}</span>
}

/** A modal confirmation. Rendered only while open; Escape and Cancel cancel. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  children?: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm(): void
  onCancel(): void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
    cancel.current?.focus()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      className="m-auto max-w-md rounded-xl border border-white/15 bg-background p-6 text-white backdrop:bg-black/70"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {title}
      </h2>
      {children && <div className="mt-2 text-sm text-white/80">{children}</div>}
      <div className="mt-6 flex justify-end gap-3">
        <button ref={cancel} type="button" className={SECONDARY} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={PRIMARY} disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}

/** The form came back with unsaved changes. */
export function RestoredNotice({ onDiscard }: { onDiscard(): void }) {
  return (
    <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-white/5 px-3 py-2 text-sm">
      <span>Restored unsaved changes.</span>
      <button type="button" className={SECONDARY} onClick={onDiscard}>
        Discard
      </button>
    </div>
  )
}

export interface SummaryEntry {
  /** The id of the field to go to, or null for a problem of the whole form. */
  target: string | null
  text: string
}

/** The problems that stopped a save, each linking to its field. Takes focus when shown. */
export function ErrorSummary({ entries }: { entries: SummaryEntry[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.focus()
  }, [entries])
  if (!entries.length) return null
  return (
    <div ref={box} tabIndex={-1} role="alert" className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm">
      <p className="font-semibold">
        {entries.length === 1 ? 'There is 1 problem.' : `There are ${entries.length} problems.`}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {entries.map((entry, i) => (
          <li key={i}>
            {entry.target ? (
              <a
                href={`#${entry.target}`}
                className="underline"
                onClick={(event) => {
                  event.preventDefault()
                  document.getElementById(entry.target as string)?.focus()
                }}
              >
                {entry.text}
              </a>
            ) : (
              entry.text
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A loading or failed query, with a way to try again. */
export function QueryState({ error, onRetry }: { error: unknown; onRetry(): void }) {
  if (!error) return <p role="status" className="mt-4 text-white/60">Loading…</p>
  return (
    <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-red-500/10 px-3 py-2 text-sm">
      <span>{errorMessage(error)}</span>
      <button type="button" className={SECONDARY} onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
