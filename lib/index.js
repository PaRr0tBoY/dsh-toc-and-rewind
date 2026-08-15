import { BlockAssembler, createUserMessage } from "@deepseek-ai/dsh-llm";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
//#region lib/types/rewind/region.js
/**
* Fold-region selection over a session surface: the pure log/surface math a
* rewind runs. The tool-pairing balance is a local reimplementation of the
* official compaction seam's `toolPairingBalancedBefore/After` (that package
* is not published to npm), so a fold never splits a tool-call/result pair.
*
* @module dsh-toc-tail/rewind/region
*/
/** Typed error for rewind fold rejections. */
var RewindError = class extends Error {
	code;
	name = "RewindError";
	/**
	* Create one classified fold failure.
	* @param code - stable failure class.
	* @param message - backend diagnostic retained as the Error message.
	*/
	constructor(code, message) {
		super(message);
		this.code = code;
	}
};
/** The open turn enclosing a log position, or `null` between turns. */
function openTurnOf(events) {
	let latest;
	for (const event of events) if (event.type === "turn/start" || event.type === "turn/end") latest = event;
	return latest?.type === "turn/start" ? latest.data.turn : null;
}
/** How one surface event changes the in-progress tool-call count. */
function eventDelta(event) {
	switch (event.type) {
		case "assistant/message": return event.data.message.content.filter((block) => block.type === "tool-call").length;
		case "tool/result": return -1;
		default: return 0;
	}
}
/**
* Balance of every surface cut: `cuts[i]` is the cut immediately before
* surface node `i` (`cuts[0]` is the surface head, trivially balanced).
* A cut is balanced when no unanswered tool call crosses it.
* @param events - the session's event log.
* @param seqs - the current surface node seqs, in surface order.
* @returns one boolean per cut (length `seqs.length + 1`).
*/
function cutBalances(events, seqs) {
	const cuts = [true];
	let inProgressToolCalls = 0;
	for (const seq of seqs) {
		const event = events[seq];
		if (event === void 0 || event.seq !== seq) throw new RewindError("INVALID_TARGET", `surface seq ${seq} has no matching session event (corrupt surface)`);
		inProgressToolCalls += eventDelta(event);
		if (inProgressToolCalls < 0) throw new RewindError("UNBALANCED", `tool/result at surface seq ${seq} has no matching tool-call (corrupt surface)`);
		cuts.push(inProgressToolCalls === 0);
	}
	return cuts;
}
/**
* Select the fold region: every surface node from the target user request on
* (the selected message itself is withdrawn — revoked back to the composer,
* as if it was never sent), up to the surface tail. The region starts at the
* first tool-pairing-balanced cut at or after the target so a fold never
* splits a tool-call/result pair.
* @param source - the session's events and surface.
* @param targetSeq - event seq of the selected user request.
* @returns the validated inclusive surface span.
* @throws {@link RewindError} `INVALID_TARGET` when the seq is not a surface
* node, `EMPTY_REGION` when nothing follows, `UNBALANCED` when no balanced
* cut exists.
*/
function selectRewindRegion(source, targetSeq) {
	if (!Number.isSafeInteger(targetSeq) || targetSeq < 0) throw new RewindError("INVALID_TARGET", `rewind target must be a non-negative safe integer, got ${String(targetSeq)}`);
	const seqs = source.surface.nodes;
	if (!seqs.includes(targetSeq)) throw new RewindError("INVALID_TARGET", `rewind target seq ${targetSeq} is not a current surface node`);
	const targetEvent = source.events[targetSeq];
	if (targetEvent === void 0 || targetEvent.type !== "user/message") throw new RewindError("INVALID_TARGET", `rewind target seq ${targetSeq} is not a user request`);
	const cuts = cutBalances(source.events, seqs);
	let startIdx = seqs.findIndex((seq) => seq >= targetSeq);
	if (startIdx === -1) throw new RewindError("EMPTY_REGION", `rewind: no surface nodes at or after seq ${targetSeq}`);
	while (startIdx < seqs.length && !cuts[startIdx]) startIdx += 1;
	if (startIdx >= seqs.length) throw new RewindError("UNBALANCED", "rewind: no balanced fold cut at or after the target node");
	const endIdx = seqs.length - 1;
	return {
		start: seqs[startIdx],
		end: seqs[endIdx],
		shadowedSeqs: seqs.slice(startIdx)
	};
}
//#endregion
//#region lib/types/rewind/summarize.js
/**
* Auto-generated fold summaries: the `ctx.llm.stream` call that condenses the
* rewound conversation span into a report which replaces the span on the
* surface. Provider/model resolution mirrors the official compaction seam:
* the session's last routed request/header config, then the agent's options.
*
* @module dsh-toc-tail/rewind/summarize
*/
/** Canonical source marker for toc-tail injected surface messages. */
const TOC_REWIND_SOURCE = Object.freeze({
	kind: "plugin",
	plugin: "toc-tail"
});
/** The summarization directive, delivered as the final user message. */
const SUMMARY_INSTRUCTION = [
	"你正在为这个 AI 编码助手把一段已完成的对话压缩成简洁报告。请把上面的对话内容（所选节点之后的部分）总结成一份报告，使后续对话不需要这些中间步骤即可继续。",
	"",
	"严格按下面的 Markdown 结构输出，各节顺序不变；用简洁的要点而非整段叙述；空节写 \"(none)\"，不要删节。",
	"",
	"## 已完成的工作",
	"- [这段对话完成了什么：结论、证据、数字]",
	"",
	"## 关键决策",
	"- [做出的选择及其理由]",
	"",
	"## 代码与文件改动",
	"- [精确路径：为何重要、关键改动或片段]",
	"",
	"## 未决问题",
	"- [尚未解决的开放问题]",
	"",
	"## 建议的下一步",
	"- [唯一的下一步动作，或 \"(none)\"]",
	"",
	"规则：",
	"- 使用简洁的中文工程表述。保留精确的文件路径、命令、错误字符串、标识符、数值、函数签名与语法片段。",
	"- 总结对话的结论与成果，而非过程。",
	"- 不要提及本次总结请求或上下文已被压缩。",
	"- 只输出报告文本：不要调用任何工具或采取其他动作。"
].join("\n");
/**
* Resolve the summarization target: the session's last routed request/header
* config, then the agent's options. Missing both fails loud.
* @param agent - the agent whose session is folded.
* @returns the resolved provider/model pair.
* @throws when neither source is configured.
*/
function resolveTarget(agent) {
	const header = agent.session.requestHeader()?.config;
	if (header !== void 0 && header.provider !== void 0 && header.model !== void 0) return {
		provider: header.provider,
		model: header.model
	};
	const options = agent.options;
	if (options.provider !== void 0 && options.provider.length > 0 && options.model !== void 0 && options.model.length > 0) return {
		provider: options.provider,
		model: options.model
	};
	throw new Error("toc-tail rewind: no provider/model available for summarization — route one request or set AgentOptions fields");
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
async function summarizeRegion(ctx, session, region, agent, signal) {
	const target = resolveTarget(agent);
	const header = session.requestHeader();
	const messages = [];
	for (const seq of region.shadowedSeqs) {
		const message = session.deriveEventMessage(session.events[seq]);
		if (message !== null) messages.push(message);
	}
	messages.push(createUserMessage({
		content: [{
			type: "text",
			text: SUMMARY_INSTRUCTION
		}],
		source: TOC_REWIND_SOURCE
	}));
	const options = {
		provider: target.provider,
		model: target.model,
		messages,
		...header?.system === void 0 ? {} : { system: header.system },
		...header?.tools === void 0 ? {} : { tools: [...header.tools] },
		maxTokens: 2048,
		sessionId: session.id,
		...signal === void 0 ? {} : { signal }
	};
	const assembler = new BlockAssembler();
	for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk);
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") throw new Error(`toc-tail rewind summarization stream ended with ${finish.kind}`);
	const report = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("");
	if (report.trim().length === 0) throw new Error("toc-tail rewind summarization produced no text");
	return report;
}
/**
* Run one rewind fold against the agent's session.
* @param ctx - context carrying the llm service (used only with `summary`).
* @param agent - the agent whose session is folded.
* @param snapshots - the code snapshot store (used only with `code`).
* @param targetSeq - event seq of the selected user request.
* @param options - the chosen post-rewind actions.
* @param signal - optional cancellation signal forwarded to summarization.
* @returns the settled fold result.
* @throws {@link RewindError} for expected failures.
*/
async function executeRewind(ctx, agent, snapshots, targetSeq, options, signal) {
	const session = agent.session;
	const region = selectRewindRegion(session, targetSeq);
	let report;
	if (options.summary) {
		report = await summarizeRegion(ctx, session, region, agent, signal);
		signal?.throwIfAborted();
	}
	let restoredFiles;
	if (options.code) restoredFiles = (await snapshots.restore(session, targetSeq)).restoredCount;
	const record = session.append("toc/rewind", {
		turn: openTurnOf(session.events),
		targetSeq,
		foldedRange: {
			start: region.start,
			end: region.end
		},
		options: {
			code: options.code,
			summary: options.summary
		},
		...report === void 0 ? {} : { report }
	});
	session.append("user/message", createUserMessage({
		content: [{
			type: "text",
			text: report ?? "⏪ 已回溯到此处，以下对话已折叠。"
		}],
		source: TOC_REWIND_SOURCE
	}), {
		surfaceOp: {
			op: "replace",
			start: region.start,
			end: region.end
		},
		sourceEventSeqs: [record.seq, ...region.shadowedSeqs]
	});
	return {
		foldedNodes: region.shadowedSeqs.length,
		start: region.start,
		end: region.end,
		...report === void 0 ? {} : { report },
		...restoredFiles === void 0 ? {} : { restoredFiles }
	};
}
//#endregion
//#region lib/types/rewind/command.js
/**
* The `/toc-rewind` slash command: rewinds the conversation to a user-request
* node by folding everything after it (surface replace), optionally restoring
* the code state at that node and/or keeping an LLM summary of the folded
* span as the new context. The directory panel's confirm menu submits this
* command through the client's `session.command` channel.
*
* @module dsh-toc-tail/rewind/command
*/
const USAGE = "Usage: /toc-rewind <seq> [code] [summary]";
/** Parse `<seq> [code] [summary]` into a target and option flags. */
function parseRewindArgs(rawInput) {
	const parts = rawInput.trim().split(/\s+/u).filter((part) => part.length > 0);
	if (parts.length < 1) throw new RewindError("INVALID_TARGET", USAGE);
	const seq = Number.parseInt(parts[0], 10);
	if (!Number.isSafeInteger(seq) || seq < 0) throw new RewindError("INVALID_TARGET", `rewind target must be a non-negative integer, got "${parts[0]}"`);
	const flags = new Set(parts.slice(1));
	for (const flag of flags) if (flag !== "code" && flag !== "summary") throw new RewindError("INVALID_TARGET", `unknown rewind option "${flag}"; ${USAGE}`);
	return {
		seq,
		options: {
			code: flags.has("code"),
			summary: flags.has("summary")
		}
	};
}
/** Register the global `/toc-rewind` command. */
function registerRewindCommand(ctx, snapshots) {
	ctx.commands.register({
		name: "toc-rewind",
		description: "rewind the conversation to a user-request node (fold everything after it)",
		input: { hint: "<seq> [code] [summary]" },
		handler: async ({ agent, rawInput, signal }) => {
			let parsed;
			try {
				parsed = parseRewindArgs(rawInput);
			} catch (error) {
				return errorResult(error);
			}
			try {
				const result = await executeRewind(ctx, agent, snapshots, parsed.seq, parsed.options, signal);
				return {
					kind: "success",
					text: [
						`Rewound to seq ${parsed.seq}: folded ${result.foldedNodes} node(s) [${result.start}..${result.end}].`,
						...result.report === void 0 ? [] : ["Kept an LLM summary of the folded span."],
						...result.restoredFiles === void 0 ? [] : [`Restored ${result.restoredFiles} file(s) from the code snapshot.`]
					].join("\n")
				};
			} catch (error) {
				return errorResult(error);
			}
		}
	});
}
/** Fold any thrown error into a CommandResult failure message. */
function errorResult(error) {
	return {
		kind: "error",
		text: `toc-rewind failed: ${error instanceof Error ? error.message : String(error)}`
	};
}
//#endregion
//#region lib/types/rewind/snapshot.js
/**
* Code snapshots: every `user/message` event captures the session workspace
* tree, so a rewind to any user-request node can restore the code state as it
* was when that request started. Snapshots live under
* `<baseDir>/toc-tail/snapshots/<sessionId>/<seq>.json` as a flat relative
* path → utf8 text map. Restore picks the newest snapshot at or before the
* target seq and writes its files back into the workspace.
*
* @module dsh-toc-tail/rewind/snapshot
*/
/** Directories never snapshotted (transient, huge, or tool-owned). */
const IGNORED_DIRS = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	".dsh",
	"dist",
	"lib",
	".reasonix"
]);
/** Only text files under this size (bytes) enter a snapshot. */
const MAX_FILE_BYTES = 1 << 20;
/** Whether a path is one of the ignored workspace directories. */
function isIgnored(relativePath) {
	return relativePath.split(sep).some((part) => IGNORED_DIRS.has(part));
}
/** Walk a workspace tree, returning relative path → utf8 content. */
async function collectWorkspace(cwd) {
	const files = {};
	const pending = [cwd];
	while (pending.length > 0) {
		const dir = pending.pop();
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const abs = join(dir, entry.name);
			const rel = relative(cwd, abs);
			if (isIgnored(rel)) continue;
			if (entry.isDirectory()) pending.push(abs);
			else if (entry.isFile()) try {
				if ((await stat(abs)).size > MAX_FILE_BYTES) continue;
				files[rel.split(sep).join("/")] = await readFile(abs, "utf8");
			} catch {}
		}
	}
	return files;
}
/**
* Snapshot store for one plugin context. `capture` is fire-and-forget from
* the session/event hook; `restore` is awaited from the rewind command.
*/
var SnapshotStore = class {
	/** Root directory holding one folder per session. */
	root;
	/**
	* Create the store.
	* @param baseDir - host data directory (`ctx.baseDir`).
	*/
	constructor(baseDir) {
		this.root = join(baseDir, "toc-tail", "snapshots");
	}
	dirFor(sessionId) {
		return join(this.root, encodeURIComponent(sessionId));
	}
	/**
	* Capture the session workspace as of a user/message seq. Resolves with
	* the captured count; never rejects (a failed capture is logged by the
	* caller through the returned rejection on I/O errors inside collect).
	* @param session - the session whose workspace to capture.
	* @param seq - the triggering event seq (also the snapshot key).
	* @param cwd - the workspace root (defaults to the session header cwd).
	* @returns the capture result.
	*/
	async capture(session, seq, cwd) {
		const workspace = cwd ?? session.header.cwd;
		if (workspace === void 0) return {
			seq,
			fileCount: 0
		};
		const dir = this.dirFor(session.id);
		await mkdir(dir, { recursive: true });
		const payload = { files: await collectWorkspace(resolve(workspace)) };
		await writeFile(join(dir, `${seq}.json`), JSON.stringify(payload), "utf8");
		return {
			seq,
			fileCount: Object.keys(payload.files).length
		};
	}
	/**
	* Restore the newest snapshot at or before `targetSeq` into the workspace.
	* @param session - the session being rewound.
	* @param targetSeq - the rewind target user-request seq.
	* @param cwd - the workspace root (defaults to the session header cwd).
	* @returns the restore result; a missing snapshot resolves with `null`
	* snapshotSeq and zero restored files.
	*/
	async restore(session, targetSeq, cwd) {
		const workspace = cwd ?? session.header.cwd;
		if (workspace === void 0) return {
			snapshotSeq: -1,
			restoredCount: 0
		};
		const dir = this.dirFor(session.id);
		let names;
		try {
			names = await readdir(dir);
		} catch {
			return {
				snapshotSeq: -1,
				restoredCount: 0
			};
		}
		const candidates = names.filter((name) => name.endsWith(".json")).map((name) => Number.parseInt(name.slice(0, -5), 10)).filter((seq) => Number.isSafeInteger(seq) && seq <= targetSeq).sort((a, b) => b - a);
		if (candidates.length === 0) return {
			snapshotSeq: -1,
			restoredCount: 0
		};
		const snapshotSeq = candidates[0];
		const payload = JSON.parse(await readFile(join(dir, `${snapshotSeq}.json`), "utf8"));
		let restoredCount = 0;
		const root = resolve(workspace);
		for (const [rel, content] of Object.entries(payload.files)) {
			const target = resolve(root, ...rel.split("/"));
			if (!target.startsWith(root + sep) && target !== root) continue;
			await mkdir(join(target, ".."), { recursive: true });
			await writeFile(target, content, "utf8");
			restoredCount += 1;
		}
		return {
			snapshotSeq,
			restoredCount
		};
	}
};
//#endregion
//#region lib/types/index.js
/**
* dsh-toc-tail host half: the rewind engine behind the directory panel.
* Every `user/message` event snapshots the session workspace (code restore
* source); the `/toc-rewind` slash command folds the conversation surface
* from a chosen user-request node onward — plain fold, LLM summary, and/or
* code restore per the client's confirm menu. The browser half ships via
* exports["./client"] and triggers this command through `session.command`.
*
* @module dsh-toc-tail
*/
/** Host plugin identity (matches cordis.patch.yml and the client bundle). */
const name = "dsh-toc-tail";
/** The rewind command needs the host command registry. */
const inject = ["commands"];
/**
* Install the host half: workspace snapshots on every user message, then the
* `/toc-rewind` command.
* @param ctx - the host cordis context.
*/
function apply(ctx) {
	const snapshots = new SnapshotStore(process.env.DSH_HOME ?? process.cwd());
	ctx.on("session/event", (session, event) => {
		if (event.type !== "user/message") return;
		snapshots.capture(session, event.seq).catch((error) => {
			ctx.logger.warn("toc-tail snapshot failed: %s", error instanceof Error ? error.message : String(error));
		});
	});
	registerRewindCommand(ctx, snapshots);
}
//#endregion
export { RewindError, apply, inject, name };
