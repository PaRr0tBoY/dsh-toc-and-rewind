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
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Shared holder the root-scope rail reads; owned by the plugin's apply fiber. */
export interface InputBridge {
    /** Current session's input action face, or null while no composer is live. */
    actions: InputActions | null;
}
/** Live input write face, captured from the session-scope standard kit. */
type InputActions = PropsRuntime<'conversation.composer.dock'>['inputActions'];
/** Invisible dock entry: captures the input face and renders nothing. */
export declare const InputBridgeView: import("react").MemoExoticComponent<({ inputActions, bridge, }: PropsRuntime<"conversation.composer.dock"> & {
    readonly bridge: InputBridge;
}) => null>;
/** Register the invisible bridge into the composer dock band. */
export declare function registerInputBridge(ctx: Context, bridge: InputBridge): void;
export {};
//# sourceMappingURL=InputBridge.d.ts.map