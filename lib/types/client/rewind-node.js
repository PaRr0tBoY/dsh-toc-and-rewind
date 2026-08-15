import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Rewind marker nodes: the host half's fold replacement message
 * (`user/message` with source `{ kind: 'plugin', plugin: 'toc-tail' }`) is not
 * an append-surface event, so the stock definitions never render it — this
 * Definition claims it and renders a visible summary card at the bottom of
 * the message flow, carrying the shadowed seqs the rail uses to hide the
 * folded conversation and prune its ticks.
 * @module dsh-toc-tail/client/rewind-node
 */
import { memo } from 'react';
import css from './TocTail.module.css';
/** Stable plugin identity of the fold replacement message. */
export const REWIND_SOURCE_PLUGIN = 'toc-tail';
/** Join the text blocks of the replacement message. */
function extractText(content) {
    let text = '';
    for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string') {
            text += block.text;
        }
    }
    return text;
}
/**
 * Recover the shadowed surface seqs from the replacement's provenance: the
 * `sourceEventSeqs` array lists the `toc/rewind` record seq (the largest —
 * appended last) followed by every shadowed surface node.
 */
export function extractShadowedSeqs(sourceEventSeqs) {
    if (!Array.isArray(sourceEventSeqs))
        return [];
    const seqs = sourceEventSeqs.filter((seq) => typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0);
    if (seqs.length === 0)
        return [];
    const recordSeq = Math.max(...seqs);
    return seqs.filter(seq => seq < recordSeq);
}
/** Claim the plugin's fold replacement message and read its payload. */
export const rewindMarkerDefinition = {
    kind: 'toc-rewind',
    target: 'chat',
    match: (event) => {
        if (event.type !== 'user/message')
            return null;
        const source = event.data.source;
        if (source?.kind !== 'plugin' || source.plugin !== REWIND_SOURCE_PLUGIN)
            return null;
        return { id: String(event.seq), role: 'start' };
    },
    start: (_context, match) => {
        const event = match.event;
        return {
            kind: 'toc-rewind',
            seq: event.seq,
            time: event.time,
            text: extractText(event.data.content),
            shadowedSeqs: extractShadowedSeqs(event.sourceEventSeqs),
        };
    },
    update: context => context.state,
    buildViewNode: (context) => {
        if (context.state === undefined)
            return null;
        const location = context.matches[0]?.location;
        if (location === undefined)
            return null;
        return {
            key: context.key,
            kind: 'toc-rewind',
            id: context.id,
            target: 'chat',
            anchorSeq: context.state.seq,
            location,
            visibility: 'visible',
            data: context.state,
        };
    },
};
/** Keyed chat renderer for the rewind marker card. */
export const RewindMarkerNodeView = memo(function RewindMarkerNodeView({ node, t, }) {
    const data = node.data;
    return (_jsxs("div", { className: css.rewindMarker, children: [_jsx("p", { className: css.rewindMarkerText, children: data.text }), _jsx("span", { className: css.rewindMarkerMeta, children: t('rewind.folded', { n: data.shadowedSeqs.length }) })] }));
});
/** Register the definition and its renderer on the owning context. */
export function registerRewindMarker(ctx) {
    ctx.conversationEvents.register(rewindMarkerDefinition);
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'toc-rewind', locale: 'toc-tail' }, RewindMarkerNodeView));
}
