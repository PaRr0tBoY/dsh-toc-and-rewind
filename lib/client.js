window.__ModuleLoader__.load({
	id: "dsh-toc-tail",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/controller.js
		const COLD_VIEW = Object.freeze({
			status: "cold",
			entries: []
		});
		/**
		* Join one user message's text blocks into a single line summary, collapsing
		* whitespace and truncating at {@link SUMMARY_MAX_LENGTH}. Pure.
		* @param node - finalized user message node.
		* @param maxLength - optional length cap override.
		* @returns the summary; '' when the message carries no text.
		*/
		function summarize(node, maxLength = 80) {
			let text = "";
			for (const block of node.content) if (block.type === "text" && typeof block.text === "string") text += block.text;
			const collapsed = text.replace(/\s+/g, " ").trim();
			if (collapsed.length <= maxLength) return collapsed;
			return collapsed.slice(0, maxLength) + "…";
		}
		/** Raw text length of one user message, un-collapsed and untruncated. */
		function textLength(node) {
			let length = 0;
			for (const block of node.content) if (block.type === "text" && typeof block.text === "string") length += block.text.length;
			return length;
		}
		/** Narrowest / widest tick in px. */
		const TICK_WIDTH_RANGE = {
			min: 16,
			max: 32
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
		function tickWidthFor(length, maxLength, min = TICK_WIDTH_RANGE.min, max = TICK_WIDTH_RANGE.max) {
			const ratio = maxLength <= 0 ? 0 : Math.min(Math.max(length, 0), maxLength) / maxLength;
			return Math.round(min + ratio * (max - min));
		}
		/**
		* Extract the visible user messages from one conversation snapshot, in
		* conversation (event seq) order. Entries shadowed by a rewind fold (their
		* seq listed in a `toc-rewind` marker) are dropped so the rail only indexes
		* the surviving conversation. Pure.
		* @param snapshot - live conversation snapshot.
		* @returns one {@link TocEntry} per visible user message.
		*/
		function extractUserEntries(snapshot) {
			const nodes = [];
			const shadowed = /* @__PURE__ */ new Set();
			for (const node of snapshot.chat.nodes.values()) if (node.kind === "toc-rewind") {
				const data = node.data;
				for (const seq of data.shadowedSeqs ?? []) shadowed.add(seq);
			}
			for (const node of snapshot.chat.nodes.values()) if (node.kind === "user" && node.visibility !== "hidden") nodes.push(node);
			nodes.sort((a, b) => a.anchorSeq - b.anchorSeq);
			const entries = [];
			for (const node of nodes) {
				const data = node.data;
				if (shadowed.has(data.seq)) continue;
				entries.push({
					key: node.key,
					seq: data.seq,
					time: data.time,
					summary: summarize(data),
					length: textLength(data)
				});
			}
			return entries;
		}
		const EMPTY_DERIVED = Object.freeze({
			shadowedSeqs: Object.freeze(/* @__PURE__ */ new Set()),
			nodesByKey: Object.freeze(/* @__PURE__ */ new Map())
		});
		/**
		* Project one conversation snapshot into the rail's derived state: shadowed
		* seqs (from `toc-rewind` markers) and the key→anchorSeq map. Pure.
		* @param snapshot - live conversation snapshot.
		* @returns derived state.
		*/
		function deriveTocState(snapshot) {
			const shadowedSeqs = /* @__PURE__ */ new Set();
			const nodesByKey = /* @__PURE__ */ new Map();
			for (const node of snapshot.chat.nodes.values()) {
				nodesByKey.set(node.key, node.anchorSeq);
				if (node.kind === "toc-rewind") {
					const data = node.data;
					for (const seq of data.shadowedSeqs ?? []) shadowedSeqs.add(seq);
				}
			}
			return Object.freeze({
				shadowedSeqs,
				nodesByKey
			});
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
		function activeUserKey(rows, viewportTop, viewportBottom) {
			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];
				if (row.bottom > viewportTop && row.top < viewportBottom) {
					for (let j = i; j >= 0; j--) if (rows[j].isUser) return rows[j].key;
					return null;
				}
			}
			return null;
		}
		/**
		* Per-session TOC object layer. One instance backs the rail while the session
		* is current; it subscribes to the session's conversation snapshot lazily (on
		* the first subscriber) and stops when the last subscriber leaves.
		*/
		var TocController = class {
			session;
			view = COLD_VIEW;
			derived = EMPTY_DERIVED;
			listeners = /* @__PURE__ */ new Set();
			unsubscribe = null;
			disposed = false;
			/**
			* @param session - the outward session face (ObservableSnapshot half).
			*/
			constructor(session) {
				this.session = session;
			}
			/** Return the cached immutable view. */
			getSnapshot = () => this.view;
			/**
			* Return the full raw text of one user request by event seq (used to
			* prefill the composer when a rewind withdraws it), or undefined when no
			* user node carries that seq.
			* @param seq - source event seq.
			* @returns the joined text blocks, or undefined.
			*/
			textOf(seq) {
				const snapshot = this.session.getSnapshot();
				for (const node of snapshot.chat.nodes.values()) {
					if (node.kind !== "user") continue;
					const data = node.data;
					if (data.seq !== seq) continue;
					const text = data.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
					return text === "" ? void 0 : text;
				}
			}
			/**
			* Return the snapshot-derived rail state (shadowed seqs + key→seq map),
			* always consistent with the current view (same snapshot generation).
			*/
			getDerived = () => this.derived;
			/** Subscribe to view replacement; starts the snapshot subscription on demand. */
			subscribe = (listener) => {
				this.listeners.add(listener);
				this.ensureListening();
				return () => {
					this.listeners.delete(listener);
					if (this.listeners.size === 0) this.stopListening();
				};
			};
			/**
			* Re-read the authoritative snapshot. Called on connection/reset for
			* controllers a component already subscribed to; idempotent.
			*/
			resync() {
				if (this.disposed) return;
				this.publishFrom(this.session.getSnapshot());
			}
			/** Drop subscribers, stop the snapshot subscription, and refuse further work. */
			dispose() {
				this.disposed = true;
				this.stopListening();
				this.listeners.clear();
			}
			/** Start listening to the session snapshot and seed the first view. */
			ensureListening() {
				if (this.unsubscribe !== null) return;
				this.unsubscribe = this.session.subscribe(() => {
					if (this.disposed) return;
					this.publishFrom(this.session.getSnapshot());
				});
				this.publishFrom(this.session.getSnapshot());
			}
			/** Stop listening when the last subscriber leaves. */
			stopListening() {
				this.unsubscribe?.();
				this.unsubscribe = null;
			}
			/** Replace view + derived state and contain subscriber failures. */
			publishFrom(snapshot) {
				this.derived = deriveTocState(snapshot);
				this.view = Object.freeze({
					status: "ready",
					entries: extractUserEntries(snapshot)
				});
				for (const listener of this.listeners) try {
					listener();
				} catch (error) {
					console.error("[dsh-toc-tail] subscriber threw:", error);
				}
			}
		};
		//#endregion
		//#region \0dsh-css:C:\Users\Acid\Documents\repo\dsh\src\client\TocTail.module.css.mjs
		const css = "._0smWUa_rail{z-index:50;pointer-events:none;flex-direction:column;align-items:flex-end;gap:8px;padding:16px 10px;display:flex;position:fixed;top:50%;transform:translateY(-50%)}._0smWUa_tick,._0smWUa_tickActive{cursor:pointer;pointer-events:auto;background:var(--dsh-toc-tail-tick,color-mix(in srgb, currentColor 22%, transparent));border:none;border-radius:999px;height:4px;padding:0;transition:background-color .15s,transform .15s,box-shadow .15s}._0smWUa_tick:hover,._0smWUa_tick:focus-visible,._0smWUa_tickActive{background:var(--dsh-toc-tail-tick-active,currentColor);transform:scaleY(1.6)}._0smWUa_tick:focus-visible{outline-offset:2px;outline:2px solid}._0smWUa_tickActive{box-shadow:0 0 0 3px color-mix(in srgb, currentColor 25%, transparent)}._0smWUa_directory{background:var(--dsw-specific-menu,var(--dsh-toc-tail-panel-bg,#fff));width:300px;max-height:60vh;color:var(--dsw-alias-label-secondary,var(--dsh-toc-tail-fg,#1f2328));border:1px solid var(--dsw-alias-border-inverted,color-mix(in srgb, currentColor 12%, transparent));box-shadow:var(--dsw-shadow-lv3,0 6px 24px #00000029);pointer-events:auto;border-radius:12px;flex-direction:column;gap:2px;padding:8px;display:flex;overflow-y:auto}._0smWUa_directory,._0smWUa_directoryItem,._0smWUa_directoryItemActive,._0smWUa_directorySummary,._0smWUa_rewindButton,._0smWUa_rewindMarker,._0smWUa_confirmMenu,._0smWUa_confirmButton,._0smWUa_confirmButtonPrimary{box-sizing:border-box}._0smWUa_directoryItem,._0smWUa_directoryItemActive{width:100%;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;align-items:baseline;gap:8px;padding:6px 8px;font-size:13px;line-height:1.5;display:flex}._0smWUa_directoryItem:hover,._0smWUa_directoryItem:focus-visible,._0smWUa_directoryItemActive{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb, currentColor 10%, transparent))}._0smWUa_directoryItem{align-items:center;gap:6px;display:flex}._0smWUa_directorySummary{min-width:0;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;flex:1;padding:0;font-size:13px;line-height:1.5}._0smWUa_directorySummary:focus-visible,._0smWUa_rewindButton:focus-visible{outline-offset:-2px;outline:2px solid}._0smWUa_directorySummaryText{text-overflow:ellipsis;white-space:nowrap;display:block;overflow:hidden}._0smWUa_rewindButton{width:28px;height:28px;color:inherit;cursor:pointer;opacity:0;background:0 0;border:none;border-radius:999px;flex:none;place-items:center;padding:0;transition:opacity .15s,background-color .15s;display:grid}._0smWUa_directoryItem:hover ._0smWUa_rewindButton,._0smWUa_directoryItem:focus-visible ._0smWUa_rewindButton,._0smWUa_directoryItemActive ._0smWUa_rewindButton{opacity:1}._0smWUa_rewindButton:hover{background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb, currentColor 12%, transparent))}._0smWUa_rewindButton:focus-visible{opacity:1;box-shadow:0 0 0 2px var(--dsw-alias-border-l3,currentColor);outline:none}._0smWUa_rewindMarker{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,color-mix(in srgb, currentColor 14%, transparent));background:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb, currentColor 6%, transparent));border-radius:10px;flex-direction:column;gap:6px;padding:10px 12px;display:flex}._0smWUa_rewindMarkerText{white-space:pre-wrap;word-break:break-word;margin:0;font-size:13px;line-height:1.6}._0smWUa_rewindMarkerMeta{opacity:.6;font-size:11px}._0smWUa_confirmMenu{background:color-mix(in srgb, currentColor 8%, transparent);border-radius:8px;flex-direction:column;gap:6px;padding:8px;display:flex}._0smWUa_confirmTitle{opacity:.85;font-size:12px;font-weight:600}._0smWUa_confirmOptions{gap:12px;font-size:13px;display:flex}._0smWUa_confirmOption{cursor:pointer;user-select:none;align-items:center;gap:4px;display:inline-flex}._0smWUa_confirmOption input[type=checkbox]{accent-color:currentColor}._0smWUa_confirmError{color:var(--dsw-alias-state-error-primary,#d33);opacity:.9;font-size:12px}._0smWUa_confirmActions{justify-content:flex-end;gap:8px;display:flex}._0smWUa_confirmButton,._0smWUa_confirmButtonPrimary{border:1px solid color-mix(in srgb, currentColor 25%, transparent);color:inherit;cursor:pointer;background:0 0;border-radius:999px;padding:3px 12px;font-size:12px}._0smWUa_confirmButton:hover:not(:disabled),._0smWUa_confirmButtonPrimary:hover:not(:disabled){background:color-mix(in srgb, currentColor 10%, transparent)}._0smWUa_confirmButton:disabled,._0smWUa_confirmButtonPrimary:disabled{opacity:.5;cursor:default}._0smWUa_confirmButtonPrimary{background:color-mix(in srgb, currentColor 14%, transparent);border-color:color-mix(in srgb, currentColor 45%, transparent)}._0smWUa_confirmButtonPrimary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,color-mix(in srgb, currentColor 14%, transparent))}@media (prefers-reduced-motion:reduce){._0smWUa_tick,._0smWUa_tickActive,._0smWUa_rewindButton{transition:none}}";
		const tagId = "dsh-toc-tail/TocTail.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-toc-tail";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var TocTail_module_css_default = {
			"tickActive": "_0smWUa_tickActive",
			"rewindMarker": "_0smWUa_rewindMarker",
			"confirmMenu": "_0smWUa_confirmMenu",
			"directorySummary": "_0smWUa_directorySummary",
			"confirmButtonPrimary": "_0smWUa_confirmButtonPrimary",
			"rewindMarkerMeta": "_0smWUa_rewindMarkerMeta",
			"confirmTitle": "_0smWUa_confirmTitle",
			"confirmOption": "_0smWUa_confirmOption",
			"confirmError": "_0smWUa_confirmError",
			"directoryItem": "_0smWUa_directoryItem",
			"directory": "_0smWUa_directory",
			"confirmActions": "_0smWUa_confirmActions",
			"confirmButton": "_0smWUa_confirmButton",
			"directoryItemActive": "_0smWUa_directoryItemActive",
			"tick": "_0smWUa_tick",
			"rewindButton": "_0smWUa_rewindButton",
			"rail": "_0smWUa_rail",
			"directorySummaryText": "_0smWUa_directorySummaryText",
			"rewindMarkerText": "_0smWUa_rewindMarkerText",
			"confirmOptions": "_0smWUa_confirmOptions"
		};
		const EMPTY_VIEW = {
			status: "cold",
			entries: []
		};
		/**
		* Render the TOC Tail rail.
		* @param props - injected controller resolver and rewind submitter; `useSessions`/`t` ride the standard seats.
		* @returns the rail, or null while hidden (no chat view, narrow column, no session).
		*/
		function TocTail({ controllerFor, rewind, prefill, useSessions, t }) {
			const currentId = useSessions((state) => state.current);
			const controller = currentId === void 0 ? null : controllerFor(currentId);
			const view = (0, react.useSyncExternalStore)((0, react.useCallback)((fn) => controller === null ? () => {} : controller.subscribe(fn), [controller]), () => controller?.getSnapshot() ?? EMPTY_VIEW);
			const [placement, setPlacement] = (0, react.useState)(null);
			const [activeKey, setActiveKey] = (0, react.useState)(null);
			const [open, setOpen] = (0, react.useState)(false);
			const [hoverIndex, setHoverIndex] = (0, react.useState)(null);
			const [confirmIndex, setConfirmIndex] = (0, react.useState)(null);
			const [confirmCode, setConfirmCode] = (0, react.useState)(false);
			const [confirmSummary, setConfirmSummary] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const entries = view.entries;
			controller?.getDerived();
			const maxLength = entries.reduce((max, entry) => Math.max(max, entry.length), 0);
			(0, react.useEffect)(() => {
				const scrollport = document.querySelector("[data-conversation-scroll]");
				if (scrollport === null) return;
				const chatFlow = scrollport.querySelector("[data-chat-flow]");
				let raf = 0;
				const measure = () => {
					if (chatFlow === null || !scrollport.isConnected) {
						setPlacement(null);
						return;
					}
					const rect = scrollport.getBoundingClientRect();
					if (rect.width < 640) {
						setPlacement(null);
						return;
					}
					setPlacement({ right: window.innerWidth - rect.right });
					const rows = [...scrollport.querySelectorAll("[data-chat-anchor-key]")].map((element) => {
						const rowRect = element.getBoundingClientRect();
						return {
							key: element.dataset.chatAnchorKey ?? "",
							isUser: element.dataset.chatFlowKind === "user",
							top: rowRect.top,
							bottom: rowRect.bottom
						};
					});
					setActiveKey(activeUserKey(rows, rect.top, rect.bottom));
					const derivedState = controller?.getDerived();
					if (derivedState !== void 0) for (const element of scrollport.querySelectorAll("[data-chat-anchor-key]")) {
						const seq = element.dataset.chatAnchorKey === void 0 ? void 0 : derivedState.nodesByKey.get(element.dataset.chatAnchorKey);
						element.style.display = seq !== void 0 && derivedState.shadowedSeqs.has(seq) ? "none" : "";
					}
				};
				const schedule = () => {
					if (raf === 0) raf = requestAnimationFrame(() => {
						raf = 0;
						measure();
					});
				};
				schedule();
				scrollport.addEventListener("scroll", schedule, { passive: true });
				const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
				observer?.observe(scrollport);
				window.addEventListener("resize", schedule);
				return () => {
					if (raf !== 0) cancelAnimationFrame(raf);
					scrollport.removeEventListener("scroll", schedule);
					observer?.disconnect();
					window.removeEventListener("resize", schedule);
				};
			}, [entries]);
			/** Scroll the conversation to one user row, honoring reduced motion. */
			const jumpTo = (key) => {
				const scrollport = document.querySelector("[data-conversation-scroll]");
				if (scrollport === null) return;
				const row = [...scrollport.querySelectorAll("[data-chat-anchor-key]")].find((candidate) => candidate.dataset.chatAnchorKey === key);
				if (row === void 0) return;
				const target = row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top + scrollport.scrollTop;
				const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
				scrollport.scrollTo({
					top: target,
					behavior: reduce ? "auto" : "smooth"
				});
			};
			/** Run the confirmed rewind for one entry through the injected submitter. */
			const runRewind = (entry, index) => {
				if (currentId === void 0 || busy) return;
				const withdrawnText = controller?.textOf(entry.seq);
				setBusy(true);
				setError(null);
				rewind(currentId, entry.seq, {
					code: confirmCode,
					summary: confirmSummary
				}).then(() => {
					setBusy(false);
					setConfirmIndex(null);
					setOpen(false);
					if (withdrawnText !== void 0) prefill(withdrawnText);
				}).catch((reason) => {
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
			if (currentId === void 0 || entries.length < 3) return null;
			if (placement === null) return null;
			return (0, react_jsx_runtime.jsx)("div", {
				className: TocTail_module_css_default.rail,
				style: { right: placement.right },
				role: "navigation",
				"aria-label": t("rail.aria"),
				onMouseLeave: () => setOpen(false),
				onBlur: (event) => {
					if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
				},
				onKeyDown: (event) => {
					if (event.key === "Escape") {
						setConfirmIndex(null);
						setOpen(false);
					}
				},
				children: open ? (0, react_jsx_runtime.jsx)("div", {
					className: TocTail_module_css_default.directory,
					role: "list",
					"aria-label": t("directory.aria"),
					children: entries.map((entry, index) => {
						const summary = entry.summary === "" ? t("entry.empty") : entry.summary;
						const label = t("entry.aria", {
							n: index + 1,
							summary
						});
						if (confirmIndex === index) return (0, react_jsx_runtime.jsxs)("div", {
							role: "listitem",
							className: TocTail_module_css_default.confirmMenu,
							children: [
								(0, react_jsx_runtime.jsx)("span", {
									className: TocTail_module_css_default.confirmTitle,
									children: t("confirm.title")
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: TocTail_module_css_default.directorySummary,
									children: summary
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: TocTail_module_css_default.confirmOptions,
									children: [(0, react_jsx_runtime.jsxs)("label", {
										className: TocTail_module_css_default.confirmOption,
										children: [(0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: confirmCode,
											disabled: busy,
											onChange: (event) => setConfirmCode(event.target.checked)
										}), t("confirm.code")]
									}), (0, react_jsx_runtime.jsxs)("label", {
										className: TocTail_module_css_default.confirmOption,
										children: [(0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: confirmSummary,
											disabled: busy,
											onChange: (event) => setConfirmSummary(event.target.checked)
										}), t("confirm.summary")]
									})]
								}),
								error !== null && (0, react_jsx_runtime.jsx)("span", {
									className: TocTail_module_css_default.confirmError,
									children: error
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: TocTail_module_css_default.confirmActions,
									children: [(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: TocTail_module_css_default.confirmButton,
										disabled: busy,
										onClick: () => setConfirmIndex(null),
										children: t("confirm.cancel")
									}), (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: TocTail_module_css_default.confirmButtonPrimary,
										disabled: busy,
										onClick: () => runRewind(entry, index),
										children: busy ? t("confirm.busy") : t("confirm.ok")
									})]
								})
							]
						}, entry.key);
						return (0, react_jsx_runtime.jsxs)("div", {
							role: "listitem",
							className: index === hoverIndex ? TocTail_module_css_default.directoryItemActive : TocTail_module_css_default.directoryItem,
							onMouseEnter: () => setHoverIndex(index),
							onFocus: () => setHoverIndex(index),
							children: [(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: TocTail_module_css_default.directorySummary,
								"aria-label": label,
								onClick: () => jumpTo(entry.key),
								children: (0, react_jsx_runtime.jsx)("span", {
									className: TocTail_module_css_default.directorySummaryText,
									children: summary
								})
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: TocTail_module_css_default.rewindButton,
								"aria-label": t("rewind.button"),
								onClick: () => openConfirm(index),
								children: (0, react_jsx_runtime.jsxs)("svg", {
									width: "14",
									height: "14",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									strokeLinecap: "round",
									strokeLinejoin: "round",
									"aria-hidden": "true",
									children: [(0, react_jsx_runtime.jsx)("path", { d: "M3 7v6h6" }), (0, react_jsx_runtime.jsx)("path", { d: "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" })]
								})
							})]
						}, entry.key);
					})
				}) : entries.map((entry, index) => {
					const isActive = entry.key === activeKey;
					const summary = entry.summary === "" ? t("entry.empty") : entry.summary;
					const label = t("entry.aria", {
						n: index + 1,
						summary
					});
					return (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: isActive ? TocTail_module_css_default.tickActive : TocTail_module_css_default.tick,
						style: { width: tickWidthFor(entry.length, maxLength) },
						"aria-label": label,
						"aria-current": isActive ? "true" : void 0,
						"aria-expanded": open,
						onMouseEnter: () => {
							setHoverIndex(index);
							setOpen(true);
						},
						onFocus: () => {
							setHoverIndex(index);
							setOpen(true);
						},
						onClick: () => jumpTo(entry.key)
					}, entry.key);
				})
			});
		}
		//#endregion
		//#region lib/types/client/InputBridge.js
		/**
		* Composer write bridge: the rail's overlay entry is a root-scope slot, so it
		* cannot receive the session-scope `inputActions` face (that only reaches
		* session-scope components through `sessions.provide`). This invisible
		* `conversation.composer.dock` entry (list kind, coexists with the shipped
		* stats line, renders nothing) forwards the live input action face into a
		* shared holder the root-scope rail reads when a rewind withdraws a message
		* back into the composer.
		* @module dsh-toc-tail/client/input-bridge
		*/
		/** Invisible dock entry: captures the input face and renders nothing. */
		const InputBridgeView = (0, react.memo)(function InputBridgeView({ inputActions, bridge }) {
			(0, react.useEffect)(() => {
				bridge.actions = inputActions;
				return () => {
					bridge.actions = null;
				};
			}, [bridge, inputActions]);
			return null;
		});
		/** Register the invisible bridge into the composer dock band. */
		function registerInputBridge(ctx, bridge) {
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "toc-tail-input",
				locale: "toc-tail"
			}, (props) => (0, react_jsx_runtime.jsx)(InputBridgeView, {
				...props,
				bridge
			})));
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `toc-tail` namespace dictionaries. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"rail.aria": "对话目录：按用户请求跳转对话位置",
			"entry.aria": "第 {n} 条用户请求：{summary}",
			"entry.empty": "（无文本内容）",
			"directory.aria": "对话目录",
			"confirm.title": "回溯到这条请求？",
			"confirm.code": "恢复代码",
			"confirm.summary": "总结",
			"confirm.ok": "确定",
			"confirm.cancel": "取消",
			"confirm.busy": "回溯中…",
			"confirm.error": "回溯失败",
			"rewind.button": "回溯到这条请求",
			"rewind.folded": "已折叠 {n} 条消息"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"rail.aria": "Conversation outline: jump to a user request in the conversation",
			"entry.aria": "User request {n}: {summary}",
			"entry.empty": "(no text)",
			"directory.aria": "Conversation outline",
			"confirm.title": "Rewind to this request?",
			"confirm.code": "Restore code",
			"confirm.summary": "Summarize",
			"confirm.ok": "Confirm",
			"confirm.cancel": "Cancel",
			"confirm.busy": "Rewinding…",
			"confirm.error": "Rewind failed",
			"rewind.button": "Rewind to this request",
			"rewind.folded": "{n} message(s) folded"
		};
		/** Join the text blocks of the replacement message. */
		function extractText(content) {
			let text = "";
			for (const block of content) if (block.type === "text" && typeof block.text === "string") text += block.text;
			return text;
		}
		/**
		* Recover the shadowed surface seqs from the replacement's provenance: the
		* `sourceEventSeqs` array lists the `toc/rewind` record seq (the largest —
		* appended last) followed by every shadowed surface node.
		*/
		function extractShadowedSeqs(sourceEventSeqs) {
			if (!Array.isArray(sourceEventSeqs)) return [];
			const seqs = sourceEventSeqs.filter((seq) => typeof seq === "number" && Number.isSafeInteger(seq) && seq >= 0);
			if (seqs.length === 0) return [];
			const recordSeq = Math.max(...seqs);
			return seqs.filter((seq) => seq < recordSeq);
		}
		/** Claim the plugin's fold replacement message and read its payload. */
		const rewindMarkerDefinition = {
			kind: "toc-rewind",
			target: "chat",
			match: (event) => {
				if (event.type !== "user/message") return null;
				const source = event.data.source;
				if (source?.kind !== "plugin" || source.plugin !== "toc-tail") return null;
				return {
					id: String(event.seq),
					role: "start"
				};
			},
			start: (_context, match) => {
				const event = match.event;
				return {
					kind: "toc-rewind",
					seq: event.seq,
					time: event.time,
					text: extractText(event.data.content),
					shadowedSeqs: extractShadowedSeqs(event.sourceEventSeqs)
				};
			},
			update: (context) => context.state,
			buildViewNode: (context) => {
				if (context.state === void 0) return null;
				const location = context.matches[0]?.location;
				if (location === void 0) return null;
				return {
					key: context.key,
					kind: "toc-rewind",
					id: context.id,
					target: "chat",
					anchorSeq: context.state.seq,
					location,
					visibility: "visible",
					data: context.state
				};
			}
		};
		/** Keyed chat renderer for the rewind marker card. */
		const RewindMarkerNodeView = (0, react.memo)(function RewindMarkerNodeView({ node, t }) {
			const data = node.data;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: TocTail_module_css_default.rewindMarker,
				children: [(0, react_jsx_runtime.jsx)("p", {
					className: TocTail_module_css_default.rewindMarkerText,
					children: data.text
				}), (0, react_jsx_runtime.jsx)("span", {
					className: TocTail_module_css_default.rewindMarkerMeta,
					children: t("rewind.folded", { n: data.shadowedSeqs.length })
				})]
			});
		});
		/** Register the definition and its renderer on the owning context. */
		function registerRewindMarker(ctx) {
			ctx.conversationEvents.register(rewindMarkerDefinition);
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "toc-rewind",
				locale: "toc-tail"
			}, RewindMarkerNodeView));
		}
		//#endregion
		//#region lib/types/client/index.js
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
		/** Dictionary namespace owned by this plugin. */
		const NS = "toc-tail";
		/** Required services: the slot registry, the sessions service, the copy,
		* and the conversation event registry (rewind marker nodes). */
		const inject = [
			"slots",
			"sessions",
			"locale",
			"conversationEvents"
		];
		/**
		* Client plugin body: the TOC Tail rail and its per-session object layer.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "toc-tail: dictionaries");
			registerRewindMarker(ctx);
			const bridge = { actions: null };
			registerInputBridge(ctx, bridge);
			const controllers = /* @__PURE__ */ new Map();
			const controllerFor = (sessionId) => {
				const existing = controllers.get(sessionId);
				if (existing !== void 0) return existing;
				const binding = ctx.sessions.binding(sessionId);
				if (binding === void 0) return null;
				const controller = new TocController(binding.session);
				controllers.set(sessionId, controller);
				return controller;
			};
			ctx.on("connection/reset", () => {
				for (const controller of controllers.values()) if (controller.getSnapshot().status !== "cold") controller.resync();
			});
			ctx.slots.inject("shell.overlay", () => {
				const dispose = ctx.slots.register({
					name: "shell.overlay",
					id: "toc-tail",
					order: 100,
					locale: NS,
					inject: () => ({
						controllerFor,
						rewind: (sessionId, seq, options) => {
							const session = ctx.sessions.binding(sessionId)?.session;
							if (session === void 0) return Promise.reject(/* @__PURE__ */ new Error("no session binding"));
							const flags = [options.code ? "code" : "", options.summary ? "summary" : ""].filter(Boolean).join(" ");
							return session.command(`/toc-rewind ${seq}${flags === "" ? "" : ` ${flags}`}`);
						},
						prefill: (text) => {
							bridge.actions?.setDraft(text);
						}
					})
				}, TocTail);
				return () => {
					dispose();
					for (const controller of controllers.values()) controller.dispose();
					controllers.clear();
				};
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map