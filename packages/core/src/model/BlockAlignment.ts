/**
 * Valid alignment values for block-level nodes.
 *
 * Uses CSS logical values (`start`/`end`) rather than physical
 * (`left`/`right`) for correct behavior with RTL text direction.
 */
export type BlockAlignment = 'start' | 'center' | 'end' | 'justify';
