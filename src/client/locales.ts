/** `toc-tail` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'rail.aria': '对话目录：按用户请求跳转对话位置',
  'entry.aria': '第 {n} 条用户请求：{summary}。点击回溯到此处',
  'entry.empty': '（无文本内容）',
  'directory.aria': '对话目录',
  'confirm.title': '回溯到这条请求？',
  'confirm.code': '恢复代码',
  'confirm.summary': '总结',
  'confirm.ok': '确定',
  'confirm.cancel': '取消',
  'confirm.busy': '回溯中…',
  'confirm.error': '回溯失败',
} satisfies Record<string, string>

/** The toc-tail namespace key union. */
export type TocTailKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The TOC Tail rail's copy. */
    'toc-tail': TocTailKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'rail.aria': 'Conversation outline: jump to a user request in the conversation',
  'entry.aria': 'User request {n}: {summary}. Click to rewind here',
  'entry.empty': '(no text)',
  'directory.aria': 'Conversation outline',
  'confirm.title': 'Rewind to this request?',
  'confirm.code': 'Restore code',
  'confirm.summary': 'Summarize',
  'confirm.ok': 'Confirm',
  'confirm.cancel': 'Cancel',
  'confirm.busy': 'Rewinding…',
  'confirm.error': 'Rewind failed',
} satisfies Record<TocTailKey, string>
