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

import { memo, useEffect } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Shared holder the root-scope rail reads; owned by the plugin's apply fiber. */
export interface InputBridge {
  /** Current session's input action face, or null while no composer is live. */
  actions: InputActions | null
}

/** Live input write face, captured from the session-scope standard kit. */
type InputActions = PropsRuntime<'conversation.composer.dock'>['inputActions']

/** Invisible dock entry: captures the input face and renders nothing. */
export const InputBridgeView = memo(function InputBridgeView({
  inputActions,
  bridge,
}: PropsRuntime<'conversation.composer.dock'> & { readonly bridge: InputBridge }) {
  useEffect(() => {
    bridge.actions = inputActions
    return () => {
      bridge.actions = null
    }
  }, [bridge, inputActions])
  return null
})

/** Register the invisible bridge into the composer dock band. */
export function registerInputBridge(ctx: Context, bridge: InputBridge): void {
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
    { name: 'conversation.composer.dock', id: 'toc-tail-input', locale: 'toc-tail' },
    (props: PropsRuntime<'conversation.composer.dock'>) => (
      <InputBridgeView {...props} bridge={bridge} />
    ),
  ))
}
