/**
 * Rewind marker nodes: the host half's fold replacement message
 * (`user/message` with source `{ kind: 'plugin', plugin: 'toc-tail' }`) is not
 * an append-surface event, so the stock definitions never render it — this
 * Definition claims it and renders a visible summary card at the bottom of
 * the message flow, carrying the shadowed seqs the rail uses to hide the
 * folded conversation and prune its ticks.
 * @module dsh-toc-tail/client/rewind-node
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Stable plugin identity of the fold replacement message. */
export declare const REWIND_SOURCE_PLUGIN = "toc-tail";
/** One settled rewind, rendered as a marker card at the flow bottom. */
export interface RewindMarkerNode {
    readonly kind: 'toc-rewind';
    /** Seq of the replacement user/message event. */
    readonly seq: number;
    /** Unix epoch ms from the source session event. */
    readonly time: number;
    /** Marker or LLM summary text that replaced the folded span. */
    readonly text: string;
    /** Surface seqs shadowed by this fold (the folded conversation). */
    readonly shadowedSeqs: readonly number[];
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
    interface ChatNodeDataMap {
        /** Rewind fold marker card (plugin-owned, rendered at the flow bottom). */
        'toc-rewind': RewindMarkerNode;
    }
}
/**
 * Recover the shadowed surface seqs from the replacement's provenance: the
 * `sourceEventSeqs` array lists the `toc/rewind` record seq (the largest —
 * appended last) followed by every shadowed surface node.
 */
export declare function extractShadowedSeqs(sourceEventSeqs: unknown): readonly number[];
/** Claim the plugin's fold replacement message and read its payload. */
export declare const rewindMarkerDefinition: ConversationNodeDefinition<RewindMarkerNode>;
/** Keyed chat renderer for the rewind marker card. */
export declare const RewindMarkerNodeView: import("react").MemoExoticComponent<({ node, t, }: PropsRuntime<"conversation.chat.node", "toc-rewind"> & PropsLocale<"toc-tail">) => import("react").JSX.Element>;
/** Register the definition and its renderer on the owning context. */
export declare function registerRewindMarker(ctx: Context): void;
//# sourceMappingURL=rewind-node.d.ts.map