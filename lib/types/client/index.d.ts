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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export type { TocEntry, TocView, TocController } from './controller.ts';
export type { TocTailProps, TocTailInjected } from './TocTail.tsx';
export type { TocTailKey } from './locales.ts';
export type { RewindMarkerNode } from './rewind-node.tsx';
/** Required services: the slot registry, the sessions service, the copy,
 * and the conversation event registry (rewind marker nodes). */
export declare const inject: string[];
/**
 * Client plugin body: the TOC Tail rail and its per-session object layer.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map