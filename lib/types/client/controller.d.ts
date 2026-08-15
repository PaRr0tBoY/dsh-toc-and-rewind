/**
 * TOC Tail object layer: pure projection functions over one Session's
 * ConversationSnapshot plus a per-session {@link TocController} that turns the
 * snapshot subscription into an immutable {@link TocView} (one entry per user
 * message). Components never see the session face directly — they subscribe
 * to the controller's view, the same HostObservable pattern every other
 * per-session client object layer uses.
 * @module dsh-toc-tail/client/controller
 */
import type { ConversationSnapshot, ObservableSnapshot, UserMessageNode } from '@deepseek-ai/dsh-client-runtime/client';
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
/** One user message compressed to a timeline tick. */
export interface TocEntry {
    /** Chat node key — the same identity stamped onto `data-chat-anchor-key`. */
    readonly key: string;
    /** Source event seq (deterministic ordering key). */
    readonly seq: number;
    /** Unix epoch ms from the source session event. */
    readonly time: number;
    /** Summarized text of the message ('' when it carries no text). */
    readonly summary: string;
    /** Raw text length in characters — the tick-width input. */
    readonly length: number;
}
/** Load state of a TOC controller. */
export type TocStatus = 'cold' | 'ready';
/** Immutable view published to the rail. */
export interface TocView {
    readonly status: TocStatus;
    /** User messages in conversation order. */
    readonly entries: readonly TocEntry[];
}
/** Default summary length cap in characters. */
export declare const SUMMARY_MAX_LENGTH = 80;
/**
 * Join one user message's text blocks into a single line summary, collapsing
 * whitespace and truncating at {@link SUMMARY_MAX_LENGTH}. Pure.
 * @param node - finalized user message node.
 * @param maxLength - optional length cap override.
 * @returns the summary; '' when the message carries no text.
 */
export declare function summarize(node: UserMessageNode, maxLength?: number): string;
/** Narrowest / widest tick in px. */
export declare const TICK_WIDTH_RANGE: {
    readonly min: 16;
    readonly max: 32;
};
/**
 * Map a prompt's text length to a tick width in px, proportional to the
 * longest prompt in the conversation: the longest message gets the widest
 * tick, every other tick scales by its length ratio. Pure — the rail computes
 * `maxLength` once per view, so a long request renders a visibly longer tick
 * and the longest request defines the scale.
 * @param length - raw text length in characters.
 * @param maxLength - the longest message's raw text length (the scale).
 * @param min - narrowest width.
 * @param max - widest width.
 * @returns width in px within [min, max].
 */
export declare function tickWidthFor(length: number, maxLength: number, min?: 16, max?: 32): number;
/**
 * Extract the visible user messages from one conversation snapshot, in
 * conversation (event seq) order. Entries shadowed by a rewind fold (their
 * seq listed in a `toc-rewind` marker) are dropped so the rail only indexes
 * the surviving conversation. Pure.
 * @param snapshot - live conversation snapshot.
 * @returns one {@link TocEntry} per visible user message.
 */
export declare function extractUserEntries(snapshot: ConversationSnapshot): TocEntry[];
/** Snapshot-derived state the rail needs beyond the entry list. */
export interface TocDerived {
    /** Surface seqs shadowed by every rewind fold (hidden from the flow). */
    readonly shadowedSeqs: ReadonlySet<number>;
    /** Chat node key → anchor seq, the DOM-hiding bridge. */
    readonly nodesByKey: ReadonlyMap<string, number>;
}
/**
 * Project one conversation snapshot into the rail's derived state: shadowed
 * seqs (from `toc-rewind` markers) and the key→anchorSeq map. Pure.
 * @param snapshot - live conversation snapshot.
 * @returns derived state.
 */
export declare function deriveTocState(snapshot: ConversationSnapshot): TocDerived;
/** One flow row in viewport coordinates. */
export interface FlowRow {
    /** Stable chat-node key (`data-chat-anchor-key`). */
    readonly key: string;
    /** True when this row is a user request (a paragraph start). */
    readonly isUser: boolean;
    readonly top: number;
    readonly bottom: number;
}
/**
 * Paragraph-scoped active selection: the user request that owns the first row
 * visible in the viewport band. A paragraph is one user request plus every
 * following row up to the next user request, so an assistant answer keeps its
 * user prompt's tick highlighted until the next user prompt scrolls into view.
 * When two user prompts are visible, the first (topmost) one owns the band.
 * Pure — callers supply viewport coordinates from the scrollport's own rect so
 * the result is layout-independent.
 * @param rows - all flow rows in document order.
 * @param viewportTop - band top.
 * @param viewportBottom - band bottom.
 * @returns the owning user row's key, or null.
 */
export declare function activeUserKey(rows: readonly FlowRow[], viewportTop: number, viewportBottom: number): string | null;
/**
 * Per-session TOC object layer. One instance backs the rail while the session
 * is current; it subscribes to the session's conversation snapshot lazily (on
 * the first subscriber) and stops when the last subscriber leaves.
 */
export declare class TocController implements HostObservable<TocView> {
    private readonly session;
    private view;
    private derived;
    private readonly listeners;
    private unsubscribe;
    private disposed;
    /**
     * @param session - the outward session face (ObservableSnapshot half).
     */
    constructor(session: ObservableSnapshot<ConversationSnapshot>);
    /** Return the cached immutable view. */
    getSnapshot: () => TocView;
    /**
     * Return the full raw text of one user request by event seq (used to
     * prefill the composer when a rewind withdraws it), or undefined when no
     * user node carries that seq.
     * @param seq - source event seq.
     * @returns the joined text blocks, or undefined.
     */
    textOf(seq: number): string | undefined;
    /**
     * Return the snapshot-derived rail state (shadowed seqs + key→seq map),
     * always consistent with the current view (same snapshot generation).
     */
    getDerived: () => TocDerived;
    /** Subscribe to view replacement; starts the snapshot subscription on demand. */
    subscribe: (listener: () => void) => (() => void);
    /**
     * Re-read the authoritative snapshot. Called on connection/reset for
     * controllers a component already subscribed to; idempotent.
     */
    resync(): void;
    /** Drop subscribers, stop the snapshot subscription, and refuse further work. */
    dispose(): void;
    /** Start listening to the session snapshot and seed the first view. */
    private ensureListening;
    /** Stop listening when the last subscriber leaves. */
    private stopListening;
    /** Replace view + derived state and contain subscriber failures. */
    private publishFrom;
}
//# sourceMappingURL=controller.d.ts.map