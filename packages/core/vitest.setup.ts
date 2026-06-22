/**
 * happy-dom + DOMPurify compatibility shim (test environment only).
 *
 * DOMPurify 3.4.8 (security fix GHSA-hpcv-96wg-7vj8) reads `nodeName` directly
 * off `Node.prototype` via a cached "realm-safe" getter instead of through
 * normal polymorphic property access. happy-dom only implements a working
 * `nodeName` getter as an override on the subclass prototypes (`Element`,
 * `CharacterData`, ...); the base getter on `Node.prototype` returns `''` for
 * every node. DOMPurify therefore reads an empty tag name for each element,
 * treats it as not-allowlisted, and strips all tags from the sanitized output,
 * breaking the entire HTML serialization / clipboard suite.
 *
 * Real browsers implement `Node.prototype.nodeName` polymorphically, so
 * production code is unaffected; this only manifests under happy-dom. There is
 * no version that is both working and patched: the last happy-dom-compatible
 * DOMPurify (3.4.6) predates the security fix, so a downgrade is not an option.
 *
 * The shim makes the `Node.prototype` getter dispatch to the most-derived
 * `nodeName` getter for the receiving instance, restoring browser-equivalent
 * behavior. It runs via vitest `setupFiles` so the patch is in place before any
 * source module imports DOMPurify (which caches the getter at instantiation).
 *
 * Upstream defect: happy-dom's `Node.prototype.nodeName` is not polymorphic when
 * the getter is invoked directly. Verified against happy-dom 20.10.6 and
 * dompurify 3.4.11. Remove this shim once happy-dom fixes the base getter.
 */

const nodeProto: Node = Node.prototype;
const originalDescriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
	nodeProto,
	'nodeName',
);

if (originalDescriptor?.get) {
	const baseGetter: () => string = originalDescriptor.get as () => string;

	const resolvePolymorphicGetter = (instance: object): (() => string) => {
		let proto: object | null = Object.getPrototypeOf(instance);
		while (proto && proto !== nodeProto) {
			const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
				proto,
				'nodeName',
			);
			if (descriptor?.get) return descriptor.get as () => string;
			proto = Object.getPrototypeOf(proto);
		}
		return baseGetter;
	};

	Object.defineProperty(nodeProto, 'nodeName', {
		configurable: true,
		enumerable: originalDescriptor.enumerable,
		get(this: object): string {
			return resolvePolymorphicGetter(this).call(this);
		},
	});
}
