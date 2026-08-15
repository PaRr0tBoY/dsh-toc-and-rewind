/**
 * Auto-generated fold summaries: the `ctx.llm.stream` call that condenses the
 * rewound conversation span into a report which replaces the span on the
 * surface. Provider/model resolution mirrors the official compaction seam:
 * the session's last routed request/header config, then the agent's options.
 *
 * @module dsh-toc-tail/rewind/summarize
 */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm';
/** Canonical source marker for toc-tail injected surface messages. */
export const TOC_REWIND_SOURCE = Object.freeze({ kind: 'plugin', plugin: 'toc-tail' });
/** The summarization directive, delivered as the final user message. */
const SUMMARY_INSTRUCTION = [
    '你正在为这个 AI 编码助手把一段已完成的对话压缩成简洁报告。请把上面的对话内容（所选节点之后的部分）总结成一份报告，使后续对话不需要这些中间步骤即可继续。',
    '',
    '严格按下面的 Markdown 结构输出，各节顺序不变；用简洁的要点而非整段叙述；空节写 "(none)"，不要删节。',
    '',
    '## 已完成的工作',
    '- [这段对话完成了什么：结论、证据、数字]',
    '',
    '## 关键决策',
    '- [做出的选择及其理由]',
    '',
    '## 代码与文件改动',
    '- [精确路径：为何重要、关键改动或片段]',
    '',
    '## 未决问题',
    '- [尚未解决的开放问题]',
    '',
    '## 建议的下一步',
    '- [唯一的下一步动作，或 "(none)"]',
    '',
    '规则：',
    '- 使用简洁的中文工程表述。保留精确的文件路径、命令、错误字符串、标识符、数值、函数签名与语法片段。',
    '- 总结对话的结论与成果，而非过程。',
    '- 不要提及本次总结请求或上下文已被压缩。',
    '- 只输出报告文本：不要调用任何工具或采取其他动作。',
].join('\n');
/**
 * Resolve the summarization target: the session's last routed request/header
 * config, then the agent's options. Missing both fails loud.
 * @param agent - the agent whose session is folded.
 * @returns the resolved provider/model pair.
 * @throws when neither source is configured.
 */
function resolveTarget(agent) {
    const header = agent.session.requestHeader()?.config;
    if (header !== undefined && header.provider !== undefined && header.model !== undefined) {
        return { provider: header.provider, model: header.model };
    }
    const options = agent.options;
    if (options.provider !== undefined && options.provider.length > 0
        && options.model !== undefined && options.model.length > 0) {
        return { provider: options.provider, model: options.model };
    }
    throw new Error('toc-tail rewind: no provider/model available for summarization — route one request or set AgentOptions fields');
}
/**
 * Summarize the rewound span over `ctx.llm`.
 * @param ctx - context carrying the llm service.
 * @param session - the session being folded.
 * @param region - the shadowed span to condense.
 * @param agent - the agent owning the session (routing fallback).
 * @param signal - optional cancellation signal forwarded to the stream.
 * @returns the text-only summary report.
 */
export async function summarizeRegion(ctx, session, region, agent, signal) {
    const target = resolveTarget(agent);
    const header = session.requestHeader();
    const messages = [];
    for (const seq of region.shadowedSeqs) {
        const message = session.deriveEventMessage(session.events[seq]);
        if (message !== null)
            messages.push(message);
    }
    messages.push(createUserMessage({
        content: [{ type: 'text', text: SUMMARY_INSTRUCTION }],
        source: TOC_REWIND_SOURCE,
    }));
    const options = {
        provider: target.provider,
        model: target.model,
        messages,
        ...header?.system === undefined ? {} : { system: header.system },
        ...header?.tools === undefined ? {} : { tools: [...header.tools] },
        maxTokens: 2048,
        sessionId: session.id,
        ...signal === undefined ? {} : { signal },
    };
    const assembler = new BlockAssembler();
    for await (const chunk of ctx.llm.stream(options))
        assembler.push(chunk);
    const finish = assembler.finish;
    if (finish.kind === 'error' || finish.kind === 'aborted') {
        throw new Error(`toc-tail rewind summarization stream ended with ${finish.kind}`);
    }
    const report = assembler.blocks()
        .filter((block) => block.type === 'text')
        .map(block => block.text)
        .join('');
    if (report.trim().length === 0) {
        throw new Error('toc-tail rewind summarization produced no text');
    }
    return report;
}
