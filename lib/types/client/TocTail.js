import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useCallback, useEffect, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { activeUserKey, tickWidthFor } from "./controller.js";
import css from './TocTail.module.css';
/** Below this conversation-column width the rail hides (narrow screens). */
export const MIN_COLUMN_WIDTH = 640;
/** Fewer user requests than this and the rail stays hidden. */
export const MIN_TICKS = 3;
const EMPTY_VIEW = { status: 'cold', entries: [] };
const EMPTY_DERIVED = {
    shadowedSeqs: new Set(),
    nodesByKey: new Map(),
};
/**
 * Render the TOC Tail rail.
 * @param props - injected controller resolver and rewind submitter; `useSessions`/`t` ride the standard seats.
 * @returns the rail, or null while hidden (no chat view, narrow column, no session).
 */
export function TocTail({ controllerFor, rewind, prefill, useSessions, t }) {
    const currentId = useSessions(state => state.current);
    const controller = currentId === undefined ? null : controllerFor(currentId);
    const view = useSyncExternalStore(useCallback(fn => (controller === null ? () => { } : controller.subscribe(fn)), [controller]), () => controller?.getSnapshot() ?? EMPTY_VIEW);
    const [placement, setPlacement] = useState(null);
    const [activeKey, setActiveKey] = useState(null);
    const [open, setOpen] = useState(false);
    const [hoverIndex, setHoverIndex] = useState(null);
    const [confirmIndex, setConfirmIndex] = useState(null);
    const [confirmCode, setConfirmCode] = useState(false);
    const [confirmSummary, setConfirmSummary] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const entries = view.entries;
    // Snapshot-derived shadow state (rewound conversation) — same generation as
    // the view above, so the two never disagree.
    const derived = controller?.getDerived() ?? EMPTY_DERIVED;
    // The longest request defines the tick scale: widest tick, others by ratio.
    const maxLength = entries.reduce((max, entry) => Math.max(max, entry.length), 0);
    // Scroll sync: locate the conversation scrollport, track its horizontal
    // anchor and the user request that owns the first visible row (a paragraph
    // is one user prompt plus its following assistant rows, so an answer keeps
    // the prompt's tick active until the next prompt scrolls into view). Rebuilt
    // when the entry set changes so new messages re-measure immediately.
    // rAF-throttled: scroll events are hot.
    useEffect(() => {
        const scrollport = document.querySelector('[data-conversation-scroll]');
        if (scrollport === null)
            return;
        const chatFlow = scrollport.querySelector('[data-chat-flow]');
        let raf = 0;
        const measure = () => {
            if (chatFlow === null || !scrollport.isConnected) {
                setPlacement(null);
                return;
            }
            const rect = scrollport.getBoundingClientRect();
            if (rect.width < MIN_COLUMN_WIDTH) {
                setPlacement(null);
                return;
            }
            setPlacement({ right: window.innerWidth - rect.right });
            const rows = [...scrollport.querySelectorAll('[data-chat-anchor-key]')]
                .map(element => {
                const rowRect = element.getBoundingClientRect();
                return {
                    key: element.dataset.chatAnchorKey ?? '',
                    isUser: element.dataset.chatFlowKind === 'user',
                    top: rowRect.top,
                    bottom: rowRect.bottom,
                };
            });
            setActiveKey(activeUserKey(rows, rect.top, rect.bottom));
            // Hide the rewound conversation: a DOM node whose chat key maps to a
            // shadowed seq (through the snapshot-derived key→seq bridge) collapses
            // out of the flow. Inline style — React never sets `style` on these
            // official rows, so the display value survives until the next measure.
            const derivedState = controller?.getDerived();
            if (derivedState !== undefined) {
                for (const element of scrollport.querySelectorAll('[data-chat-anchor-key]')) {
                    const seq = element.dataset.chatAnchorKey === undefined
                        ? undefined
                        : derivedState.nodesByKey.get(element.dataset.chatAnchorKey);
                    element.style.display = seq !== undefined && derivedState.shadowedSeqs.has(seq) ? 'none' : '';
                }
            }
        };
        const schedule = () => {
            if (raf === 0)
                raf = requestAnimationFrame(() => { raf = 0; measure(); });
        };
        schedule();
        scrollport.addEventListener('scroll', schedule, { passive: true });
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
        observer?.observe(scrollport);
        window.addEventListener('resize', schedule);
        return () => {
            if (raf !== 0)
                cancelAnimationFrame(raf);
            scrollport.removeEventListener('scroll', schedule);
            observer?.disconnect();
            window.removeEventListener('resize', schedule);
        };
    }, [entries]);
    /** Scroll the conversation to one user row, honoring reduced motion. */
    const jumpTo = (key) => {
        const scrollport = document.querySelector('[data-conversation-scroll]');
        if (scrollport === null)
            return;
        const row = [...scrollport.querySelectorAll('[data-chat-anchor-key]')]
            .find(candidate => candidate.dataset.chatAnchorKey === key);
        if (row === undefined)
            return;
        const target = row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop;
        const reduce = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        scrollport.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    };
    /** Run the confirmed rewind for one entry through the injected submitter. */
    const runRewind = (entry, index) => {
        if (currentId === undefined || busy)
            return;
        // Capture the target's full text before the fold withdraws it, so the
        // composer can be prefilled with the revoked message on success.
        const withdrawnText = controller?.textOf(entry.seq);
        setBusy(true);
        setError(null);
        void rewind(currentId, entry.seq, { code: confirmCode, summary: confirmSummary })
            .then(() => {
            setBusy(false);
            setConfirmIndex(null);
            setOpen(false);
            if (withdrawnText !== undefined)
                prefill(withdrawnText);
        })
            .catch((reason) => {
            setBusy(false);
            setError(reason instanceof Error ? reason.message : String(reason));
        });
    };
    /** Open the confirm menu for one directory row. */
    const openConfirm = (index) => {
        setConfirmIndex(index);
        setConfirmCode(false);
        setConfirmSummary(false);
        setError(null);
    };
    // No current session or fewer than three requests: nothing worth indexing.
    if (currentId === undefined || entries.length < MIN_TICKS)
        return null;
    if (placement === null)
        return null;
    return (_jsx("div", { className: css.rail, style: { right: placement.right }, role: "navigation", "aria-label": t('rail.aria'), onMouseLeave: () => setOpen(false), onBlur: (event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
                setOpen(false);
        }, onKeyDown: (event) => {
            if (event.key === 'Escape') {
                setConfirmIndex(null);
                setOpen(false);
            }
        }, children: open ? (_jsx("div", { className: css.directory, role: "list", "aria-label": t('directory.aria'), children: entries.map((entry, index) => {
                const summary = entry.summary === '' ? t('entry.empty') : entry.summary;
                const label = t('entry.aria', { n: index + 1, summary });
                if (confirmIndex === index) {
                    return (_jsxs("div", { role: "listitem", className: css.confirmMenu, children: [_jsx("span", { className: css.confirmTitle, children: t('confirm.title') }), _jsx("span", { className: css.directorySummary, children: summary }), _jsxs("div", { className: css.confirmOptions, children: [_jsxs("label", { className: css.confirmOption, children: [_jsx("input", { type: "checkbox", checked: confirmCode, disabled: busy, onChange: event => setConfirmCode(event.target.checked) }), t('confirm.code')] }), _jsxs("label", { className: css.confirmOption, children: [_jsx("input", { type: "checkbox", checked: confirmSummary, disabled: busy, onChange: event => setConfirmSummary(event.target.checked) }), t('confirm.summary')] })] }), error !== null && _jsx("span", { className: css.confirmError, children: error }), _jsxs("div", { className: css.confirmActions, children: [_jsx("button", { type: "button", className: css.confirmButton, disabled: busy, onClick: () => setConfirmIndex(null), children: t('confirm.cancel') }), _jsx("button", { type: "button", className: css.confirmButtonPrimary, disabled: busy, onClick: () => runRewind(entry, index), children: busy ? t('confirm.busy') : t('confirm.ok') })] })] }, entry.key));
                }
                return (_jsxs("div", { role: "listitem", className: index === hoverIndex ? css.directoryItemActive : css.directoryItem, onMouseEnter: () => setHoverIndex(index), onFocus: () => setHoverIndex(index), children: [_jsx("button", { type: "button", className: css.directorySummary, "aria-label": label, onClick: () => jumpTo(entry.key), children: _jsx("span", { className: css.directorySummaryText, children: summary }) }), _jsx("button", { type: "button", className: css.rewindButton, "aria-label": t('rewind.button'), onClick: () => openConfirm(index), children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("path", { d: "M3 7v6h6" }), _jsx("path", { d: "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" })] }) })] }, entry.key));
            }) })) : (entries.map((entry, index) => {
            const isActive = entry.key === activeKey;
            const summary = entry.summary === '' ? t('entry.empty') : entry.summary;
            const label = t('entry.aria', { n: index + 1, summary });
            return (_jsx("button", { type: "button", className: isActive ? css.tickActive : css.tick, style: { width: tickWidthFor(entry.length, maxLength) }, "aria-label": label, "aria-current": isActive ? 'true' : undefined, "aria-expanded": open, onMouseEnter: () => {
                    setHoverIndex(index);
                    setOpen(true);
                }, onFocus: () => {
                    setHoverIndex(index);
                    setOpen(true);
                }, onClick: () => jumpTo(entry.key) }, entry.key));
        })) }));
}
