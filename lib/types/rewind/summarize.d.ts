/**
 * Auto-generated fold summaries: the `ctx.llm.stream` call that condenses the
 * rewound conversation span into a report which replaces the span on the
 * surface. Provider/model resolution mirrors the official compaction seam:
 * the session's last routed request/header config, then the agent's options.
 *
 * @module dsh-toc-tail/rewind/summarize
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
import type { RewindRegion } from './region.ts';
/** Canonical source marker for toc-tail injected surface messages. */
export declare const TOC_REWIND_SOURCE: Readonly<{
    readonly kind: "plugin";
    readonly plugin: "toc-tail";
}>;
/**
 * Summarize the rewound span over `ctx.llm`.
 * @param ctx - context carrying the llm service.
 * @param session - the session being folded.
 * @param region - the shadowed span to condense.
 * @param agent - the agent owning the session (routing fallback).
 * @param signal - optional cancellation signal forwarded to the stream.
 * @returns the text-only summary report.
 */
export declare function summarizeRegion(ctx: Context, session: Session, region: RewindRegion, agent: Agent, signal?: AbortSignal): Promise<string>;
//# sourceMappingURL=summarize.d.ts.map