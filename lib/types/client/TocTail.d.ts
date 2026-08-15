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
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type TocController } from './controller.ts';
/** Below this conversation-column width the rail hides (narrow screens). */
export declare const MIN_COLUMN_WIDTH = 640;
/** Fewer user requests than this and the rail stays hidden. */
export declare const MIN_TICKS = 3;
/** Post-rewind actions the confirm menu may select. */
export interface RewindOptions {
    readonly code: boolean;
    readonly summary: boolean;
}
/** Injected business face of the TOC Tail rail. */
export interface TocTailInjected {
    /**
     * Resolve the owning Session's TOC controller, lazily creating it.
     * Returns null while the session has no binding (transient cold state);
     * the rail renders nothing until one materializes.
     */
    controllerFor: (sessionId: SessionId) => TocController | null;
    /**
     * Submit a rewind fold for one session to the host half (slash command).
     * Resolves once the host command settled; rejects on transport failure.
     */
    rewind: (sessionId: SessionId, seq: number, options: RewindOptions) => Promise<unknown>;
    /**
     * Withdraw a withdrawn message's text back into the composer (the rewind
     * target is revoked as if it was never sent). No-op while the composer
     * bridge is absent.
     */
    prefill: (text: string) => void;
}
/** Full props of one shell.overlay entry: runtime seat + injected face + locale. */
export type TocTailProps = PropsRuntime<'shell.overlay'> & InjectFace<TocTailInjected> & PropsLocale<'toc-tail'>;
/**
 * Render the TOC Tail rail.
 * @param props - injected controller resolver and rewind submitter; `useSessions`/`t` ride the standard seats.
 * @returns the rail, or null while hidden (no chat view, narrow column, no session).
 */
export declare function TocTail({ controllerFor, rewind, prefill, useSessions, t }: TocTailProps): JSX.Element | null;
//# sourceMappingURL=TocTail.d.ts.map