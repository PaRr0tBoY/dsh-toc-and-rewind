/** `toc-tail` namespace dictionaries. */
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    'rail.aria': string;
    'entry.aria': string;
    'entry.empty': string;
    'directory.aria': string;
    'confirm.title': string;
    'confirm.code': string;
    'confirm.summary': string;
    'confirm.ok': string;
    'confirm.cancel': string;
    'confirm.busy': string;
    'confirm.error': string;
    'rewind.button': string;
    'rewind.folded': string;
};
/** The toc-tail namespace key union. */
export type TocTailKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The TOC Tail rail's copy. */
        'toc-tail': TocTailKey;
    }
}
/** English dictionary, checked complete against the zh key set. */
export declare const en: {
    'rail.aria': string;
    'entry.aria': string;
    'entry.empty': string;
    'directory.aria': string;
    'confirm.title': string;
    'confirm.code': string;
    'confirm.summary': string;
    'confirm.ok': string;
    'confirm.cancel': string;
    'confirm.busy': string;
    'confirm.error': string;
    'rewind.button': string;
    'rewind.folded': string;
};
//# sourceMappingURL=locales.d.ts.map