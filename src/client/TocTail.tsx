/**
 * TOC Tail rail: one tick per user request, right-aligned and vertically
 * centered against the viewport, anchored to the conversation scrollport's
 * right edge inside the click-through `shell.overlay` layer. Active tracking
 * is bidirectional — scrolling the conversation highlights the first visible
 * user row; clicking a tick scrolls to that row. Hover/focus opens a shared
 * rounded directory panel listing every request; clicking a row turns it into
 * a rewind confirm menu (restore code / summarize toggles + confirm/cancel),
 * which submits the fold to the host half through `session.command`.
 * @module dsh-toc-tail/client/TocTail
 */

import { useCallback, useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation merge so SessionListState/current typing resolves.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { activeUserKey, tickWidthFor, type TocController, type TocView } from './controller.ts'
import css from './TocTail.module.css'

/** Below this conversation-column width the rail hides (narrow screens). */
export const MIN_COLUMN_WIDTH = 640

/** Fewer user requests than this and the rail stays hidden. */
export const MIN_TICKS = 3

/** Post-rewind actions the confirm menu may select. */
export interface RewindOptions {
  readonly code: boolean
  readonly summary: boolean
}

/** Injected business face of the TOC Tail rail. */
export interface TocTailInjected {
  /**
   * Resolve the owning Session's TOC controller, lazily creating it.
   * Returns null while the session has no binding (transient cold state);
   * the rail renders nothing until one materializes.
   */
  controllerFor: (sessionId: SessionId) => TocController | null
  /**
   * Submit a rewind fold for one session to the host half (slash command).
   * Resolves once the host command settled; rejects on transport failure.
   */
  rewind: (
    sessionId: SessionId,
    seq: number,
    options: RewindOptions,
  ) => Promise<unknown>
}

/** Full props of one shell.overlay entry: runtime seat + injected face + locale. */
export type TocTailProps =
  PropsRuntime<'shell.overlay'>
  & InjectFace<TocTailInjected>
  & PropsLocale<'toc-tail'>

/** Rail placement: horizontal anchor to the scrollport's right edge; vertical centering rides the viewport. */
interface RailPlacement {
  readonly right: number
}

const EMPTY_VIEW: TocView = { status: 'cold', entries: [] }

const EMPTY_DERIVED = {
  shadowedSeqs: new Set<number>(),
  nodesByKey: new Map<string, number>(),
}

/**
 * Render the TOC Tail rail.
 * @param props - injected controller resolver and rewind submitter; `useSessions`/`t` ride the standard seats.
 * @returns the rail, or null while hidden (no chat view, narrow column, no session).
 */
export function TocTail({ controllerFor, rewind, useSessions, t }: TocTailProps): JSX.Element | null {
  const currentId = useSessions(state => state.current)
  const controller = currentId === undefined ? null : controllerFor(currentId)
  const view = useSyncExternalStore(
    useCallback(fn => (controller === null ? () => {} : controller.subscribe(fn)), [controller]),
    () => controller?.getSnapshot() ?? EMPTY_VIEW,
  )

  const [placement, setPlacement] = useState<RailPlacement | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null)
  const [confirmCode, setConfirmCode] = useState(false)
  const [confirmSummary, setConfirmSummary] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const entries = view.entries
  // Snapshot-derived shadow state (rewound conversation) — same generation as
  // the view above, so the two never disagree.
  const derived = controller?.getDerived() ?? EMPTY_DERIVED
  // The longest request defines the tick scale: widest tick, others by ratio.
  const maxLength = entries.reduce((max, entry) => Math.max(max, entry.length), 0)

  // Scroll sync: locate the conversation scrollport, track its horizontal
  // anchor and the user request that owns the first visible row (a paragraph
  // is one user prompt plus its following assistant rows, so an answer keeps
  // the prompt's tick active until the next prompt scrolls into view). Rebuilt
  // when the entry set changes so new messages re-measure immediately.
  // rAF-throttled: scroll events are hot.
  useEffect(() => {
    const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null) return
    const chatFlow = scrollport.querySelector('[data-chat-flow]')
    let raf = 0
    const measure = (): void => {
      if (chatFlow === null || !scrollport.isConnected) {
        setPlacement(null)
        return
      }
      const rect = scrollport.getBoundingClientRect()
      if (rect.width < MIN_COLUMN_WIDTH) {
        setPlacement(null)
        return
      }
      setPlacement({ right: window.innerWidth - rect.right })
      const rows = [...scrollport.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')]
        .map(element => {
          const rowRect = element.getBoundingClientRect()
          return {
            key: element.dataset.chatAnchorKey ?? '',
            isUser: element.dataset.chatFlowKind === 'user',
            top: rowRect.top,
            bottom: rowRect.bottom,
          }
        })
      setActiveKey(activeUserKey(rows, rect.top, rect.bottom))
      // Hide the rewound conversation: a DOM node whose chat key maps to a
      // shadowed seq (through the snapshot-derived key→seq bridge) collapses
      // out of the flow. Inline style — React never sets `style` on these
      // official rows, so the display value survives until the next measure.
      const derivedState = controller?.getDerived()
      if (derivedState !== undefined) {
        for (const element of scrollport.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
          const seq = element.dataset.chatAnchorKey === undefined
            ? undefined
            : derivedState.nodesByKey.get(element.dataset.chatAnchorKey)
          element.style.display = seq !== undefined && derivedState.shadowedSeqs.has(seq) ? 'none' : ''
        }
      }
    }
    const schedule = (): void => {
      if (raf === 0) raf = requestAnimationFrame(() => { raf = 0; measure() })
    }
    schedule()
    scrollport.addEventListener('scroll', schedule, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(scrollport)
    window.addEventListener('resize', schedule)
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      scrollport.removeEventListener('scroll', schedule)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [entries])

  /** Scroll the conversation to one user row, honoring reduced motion. */
  const jumpTo = (key: string): void => {
    const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null) return
    const row = [...scrollport.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')]
      .find(candidate => candidate.dataset.chatAnchorKey === key)
    if (row === undefined) return
    const target = row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollport.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' })
  }

  /** Run the confirmed rewind for one entry through the injected submitter. */
  const runRewind = (entry: (typeof entries)[number], index: number): void => {
    if (currentId === undefined || busy) return
    setBusy(true)
    setError(null)
    void rewind(currentId, entry.seq, { code: confirmCode, summary: confirmSummary })
      .then(() => {
        setBusy(false)
        setConfirmIndex(null)
        setOpen(false)
      })
      .catch((reason: unknown) => {
        setBusy(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }

  /** Open the confirm menu for one directory row. */
  const openConfirm = (index: number): void => {
    setConfirmIndex(index)
    setConfirmCode(false)
    setConfirmSummary(false)
    setError(null)
  }

  // No current session or fewer than three requests: nothing worth indexing.
  if (currentId === undefined || entries.length < MIN_TICKS) return null
  if (placement === null) return null
  return (
    <div
      className={css.rail}
      style={{ right: placement.right }}
      role="navigation"
      aria-label={t('rail.aria')}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setConfirmIndex(null)
          setOpen(false)
        }
      }}
    >
      {/* Hover/focus replaces the rail with the directory panel, edge-aligned. */}
      {open ? (
        <div className={css.directory} role="list" aria-label={t('directory.aria')}>
          {entries.map((entry, index) => {
            const summary = entry.summary === '' ? t('entry.empty') : entry.summary
            const label = t('entry.aria', { n: index + 1, summary })
            if (confirmIndex === index) {
              return (
                <div key={entry.key} role="listitem" className={css.confirmMenu}>
                  <span className={css.confirmTitle}>{t('confirm.title')}</span>
                  <span className={css.directorySummary}>{summary}</span>
                  <div className={css.confirmOptions}>
                    <label className={css.confirmOption}>
                      <input
                        type="checkbox"
                        checked={confirmCode}
                        disabled={busy}
                        onChange={event => setConfirmCode(event.target.checked)}
                      />
                      {t('confirm.code')}
                    </label>
                    <label className={css.confirmOption}>
                      <input
                        type="checkbox"
                        checked={confirmSummary}
                        disabled={busy}
                        onChange={event => setConfirmSummary(event.target.checked)}
                      />
                      {t('confirm.summary')}
                    </label>
                  </div>
                  {error !== null && <span className={css.confirmError}>{error}</span>}
                  <div className={css.confirmActions}>
                    <button
                      type="button"
                      className={css.confirmButton}
                      disabled={busy}
                      onClick={() => setConfirmIndex(null)}
                    >
                      {t('confirm.cancel')}
                    </button>
                    <button
                      type="button"
                      className={css.confirmButtonPrimary}
                      disabled={busy}
                      onClick={() => runRewind(entry, index)}
                    >
                      {busy ? t('confirm.busy') : t('confirm.ok')}
                    </button>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={entry.key}
                role="listitem"
                className={index === hoverIndex ? css.directoryItemActive : css.directoryItem}
                onMouseEnter={() => setHoverIndex(index)}
                onFocus={() => setHoverIndex(index)}
              >
                <button
                  type="button"
                  className={css.directorySummary}
                  aria-label={label}
                  onClick={() => jumpTo(entry.key)}
                >
                  <span className={css.directorySummaryText}>{summary}</span>
                </button>
                <button
                  type="button"
                  className={css.rewindButton}
                  aria-label={t('rewind.button')}
                  onClick={() => openConfirm(index)}
                >
                  ⏪
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        entries.map((entry, index) => {
          const isActive = entry.key === activeKey
          const summary = entry.summary === '' ? t('entry.empty') : entry.summary
          const label = t('entry.aria', { n: index + 1, summary })
          return (
            <button
              key={entry.key}
              type="button"
              className={isActive ? css.tickActive : css.tick}
              style={{ width: tickWidthFor(entry.length, maxLength) }}
              aria-label={label}
              aria-current={isActive ? 'true' : undefined}
              aria-expanded={open}
              onMouseEnter={() => {
                setHoverIndex(index)
                setOpen(true)
              }}
              onFocus={() => {
                setHoverIndex(index)
                setOpen(true)
              }}
              onClick={() => jumpTo(entry.key)}
            />
          )
        })
      )}
    </div>
  )
}
