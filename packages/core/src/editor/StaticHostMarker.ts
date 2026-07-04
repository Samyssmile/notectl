/**
 * Marker attribute for static host replicas.
 *
 * Print output replicates the editor host element (tag and attributes) so
 * host-page `::part()` rules keep matching in the print document. When that
 * markup is injected into a page where `<notectl-editor>` is registered, the
 * replica must stay static markup: upgrading it into a live editor would
 * replace the replicated shadow content with a fresh editor instance.
 */
export const STATIC_HOST_ATTRIBUTE = 'data-notectl-static';

/** True when the element is a static replica that must not boot an editor. */
export function isStaticHostReplica(el: Element): boolean {
	return el.hasAttribute(STATIC_HOST_ATTRIBUTE);
}
