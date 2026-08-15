/**
 * Rewind vocabulary: the `toc/rewind` session event appended by a settled
 * fold. Log-only (no `surfaceOp`), so compaction or a later fold never
 * shadows the provenance record; the actual surface replacement is the
 * subsequent `user/message` event carrying this record's seq in its
 * `sourceEventSeqs`.
 *
 * @module dsh-toc-tail/rewind/types
 */
export {};
