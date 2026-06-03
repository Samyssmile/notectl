/**
 * Global DOMPurify host-allowlist hook for video iframes.
 *
 * Every notectl sanitize sink (paste, document parse, serialize) calls the same
 * `DOMPurify` singleton, so a single `uponSanitizeElement` hook covers all three.
 * For each `<iframe>` it rejects `srcdoc` and any `src` that is not an `https:`
 * URL whose hostname is an EXACT member of the provider embed allowlist — the
 * load-bearing check that defeats look-alikes (`evilyoutube.com`,
 * `youtube.com.evil.com`, the `https://youtube.com@evil.com` userinfo trick).
 * `ALLOWED_URI_REGEXP` cannot express host rules, so this hook is mandatory.
 *
 * The hook is global per DOMPurify instance, so installs are reference-counted:
 * the hook is added once and removed only when the last video plugin is destroyed,
 * preventing leakage across editor instances and tests.
 */

import DOMPurify from 'dompurify';
import { isAllowedEmbedSrc } from './VideoProviders.js';

let refCount = 0;
const allowedHosts = new Set<string>();
let hook: ((node: Node) => void) | null = null;

/**
 * Installs (or re-uses) the iframe host-allowlist hook, merging in the given
 * embed hostnames. Pair every call with {@link uninstallVideoIframeHook}.
 */
export function installVideoIframeHook(hosts: ReadonlySet<string>): void {
	for (const host of hosts) allowedHosts.add(host);
	refCount += 1;
	if (hook) return;

	hook = (node: Node): void => {
		if (node.nodeName.toLowerCase() !== 'iframe') return;
		const el = node as Element;
		// An iframe with srcdoc renders attacker-controlled markup; never allow it.
		if (el.hasAttribute('srcdoc')) {
			el.parentNode?.removeChild(el);
			return;
		}
		const src: string = el.getAttribute('src') ?? '';
		if (!isAllowedEmbedSrc(src, allowedHosts)) {
			el.parentNode?.removeChild(el);
		}
	};
	DOMPurify.addHook('uponSanitizeElement', hook);
}

/** Removes the hook when the last installer is gone (reference-counted). */
export function uninstallVideoIframeHook(): void {
	refCount = Math.max(0, refCount - 1);
	if (refCount > 0 || !hook) return;
	DOMPurify.removeHook('uponSanitizeElement');
	hook = null;
	allowedHosts.clear();
}
