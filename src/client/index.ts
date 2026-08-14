/**
 * TOC Tail browser half: a lightweight conversation outline in the
 * `shell.overlay` layer, anchored to the conversation column's right edge.
 * Every user request becomes one tick in a vertical rail; hover/focus opens a
 * floating panel with that request's summary plus its neighbours, and clicking
 * a tick scrolls the conversation to that row. One TocController per Session
 * backs the rail, created lazily on first use and disposed with the plugin
 * fiber (HMR safety).
 * @module dsh-toc-tail/client
 */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the shell.overlay SlotMap declaration (ui-layout's merge).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the ui-conversation Context merge (dictionary types ride ui-slots).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TocController } from './controller.ts'
import { TocTail } from './TocTail.tsx'
import type { TocTailInjected } from './TocTail.tsx'
import { en, zh } from './locales.ts'

export type { TocEntry, TocView, TocController } from './controller.ts'
export type { TocTailProps, TocTailInjected } from './TocTail.tsx'
export type { TocTailKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'toc-tail'

/** Required services: the slot registry, the sessions service, and the copy. */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Client plugin body: the TOC Tail rail and its per-session object layer.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'toc-tail: dictionaries')

  const controllers = new Map<SessionId, TocController>()
  const controllerFor = (sessionId: SessionId): TocController | null => {
    const existing = controllers.get(sessionId)
    if (existing !== undefined) return existing
    const binding = ctx.sessions.binding(sessionId)
    // A cold session stays cold until a binding materializes; the rail simply
    // renders nothing meanwhile (the component retries on the next session id).
    if (binding === undefined) return null
    const controller = new TocController(binding.session)
    controllers.set(sessionId, controller)
    return controller
  }

  // A reconnect refreshes the snapshot subscription automatically; resync
  // re-reads the authoritative snapshot for controllers already read so a
  // stale projection cannot outlive the new connection generation.
  ctx.on('connection/reset', () => {
    for (const controller of controllers.values()) {
      if (controller.getSnapshot().status !== 'cold') controller.resync()
    }
  })

  ctx.slots.inject('shell.overlay', () => {
    const dispose = ctx.slots.register({
      name: 'shell.overlay',
      id: 'toc-tail',
      order: 100,
      locale: NS,
      inject: (): TocTailInjected => ({
        controllerFor,
        // The client cannot fold a session itself (ISession has no history
        // verbs); it submits the rewind to the host half via the slash
        // command channel, exactly as the directory panel's confirm menu.
        rewind: (sessionId, seq, options) => {
          const session = ctx.sessions.binding(sessionId)?.session
          if (session === undefined) return Promise.reject(new Error('no session binding'))
          const flags = [options.code ? 'code' : '', options.summary ? 'summary' : '']
            .filter(Boolean).join(' ')
          return session.command(`/toc-rewind ${seq}${flags === '' ? '' : ` ${flags}`}`)
        },
      }),
    }, TocTail)
    return () => {
      dispose()
      for (const controller of controllers.values()) controller.dispose()
      controllers.clear()
    }
  })
}
