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
import { TocController } from "./controller.js";
import { TocTail } from "./TocTail.js";
import { registerInputBridge } from "./InputBridge.js";
import { en, zh } from "./locales.js";
import { registerRewindMarker } from "./rewind-node.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'toc-tail';
/** Required services: the slot registry, the sessions service, the copy,
 * and the conversation event registry (rewind marker nodes). */
export const inject = ['slots', 'sessions', 'locale', 'conversationEvents'];
/**
 * Client plugin body: the TOC Tail rail and its per-session object layer.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'toc-tail: dictionaries');
    // The fold replacement message renders as a marker card at the flow bottom;
    // its shadowed seqs drive the rail's hiding and pruning.
    registerRewindMarker(ctx);
    // Composer write bridge: the root-scope rail cannot reach the session-scope
    // inputActions face, so an invisible dock entry forwards it here (a rewind
    // withdraws the target message back into the composer).
    const bridge = { actions: null };
    registerInputBridge(ctx, bridge);
    const controllers = new Map();
    const controllerFor = (sessionId) => {
        const existing = controllers.get(sessionId);
        if (existing !== undefined)
            return existing;
        const binding = ctx.sessions.binding(sessionId);
        // A cold session stays cold until a binding materializes; the rail simply
        // renders nothing meanwhile (the component retries on the next session id).
        if (binding === undefined)
            return null;
        const controller = new TocController(binding.session);
        controllers.set(sessionId, controller);
        return controller;
    };
    // A reconnect refreshes the snapshot subscription automatically; resync
    // re-reads the authoritative snapshot for controllers already read so a
    // stale projection cannot outlive the new connection generation.
    ctx.on('connection/reset', () => {
        for (const controller of controllers.values()) {
            if (controller.getSnapshot().status !== 'cold')
                controller.resync();
        }
    });
    ctx.slots.inject('shell.overlay', () => {
        const dispose = ctx.slots.register({
            name: 'shell.overlay',
            id: 'toc-tail',
            order: 100,
            locale: NS,
            inject: () => ({
                controllerFor,
                // The client cannot fold a session itself (ISession has no history
                // verbs); it submits the rewind to the host half via the slash
                // command channel, exactly as the directory panel's confirm menu.
                rewind: (sessionId, seq, options) => {
                    const session = ctx.sessions.binding(sessionId)?.session;
                    if (session === undefined)
                        return Promise.reject(new Error('no session binding'));
                    const flags = [options.code ? 'code' : '', options.summary ? 'summary' : '']
                        .filter(Boolean).join(' ');
                    return session.command(`/toc-rewind ${seq}${flags === '' ? '' : ` ${flags}`}`);
                },
                // Withdraw the target message back into the composer: the invisible
                // dock bridge forwards the live inputActions face when present.
                prefill: (text) => {
                    bridge.actions?.setDraft(text);
                },
            }),
        }, TocTail);
        return () => {
            dispose();
            for (const controller of controllers.values())
                controller.dispose();
            controllers.clear();
        };
    });
}
