/**
 * Platform and browser detection utilities.
 *
 * Determines the current platform (macOS/iOS) and browser engine, which
 * affects keyboard shortcut bindings and browser-specific workarounds.
 * Also provides BiDi text direction detection.
 *
 * All detection results are cached after first evaluation for performance.
 */

interface NavigatorUAData {
	readonly platform?: string;
}

let cachedIsMac: boolean | undefined;
let cachedIsFirefox: boolean | undefined;
let cachedIsWebKit: boolean | undefined;

/** Returns `true` when running on macOS or iOS. */
export function isMac(): boolean {
	if (cachedIsMac !== undefined) return cachedIsMac;
	if (typeof navigator === 'undefined') {
		cachedIsMac = false;
		return false;
	}
	if ('userAgentData' in navigator) {
		const uaData: NavigatorUAData = navigator.userAgentData as NavigatorUAData;
		if (uaData.platform) {
			cachedIsMac = /macOS/i.test(uaData.platform);
			return cachedIsMac;
		}
	}
	cachedIsMac = /Mac|iP(hone|[oa]d)/.test(navigator.platform);
	return cachedIsMac;
}

/**
 * Returns `true` when running on Firefox (Gecko engine).
 * Only use for genuine browser workarounds, not feature detection.
 */
export function isFirefox(): boolean {
	if (cachedIsFirefox !== undefined) return cachedIsFirefox;
	if (typeof navigator === 'undefined') {
		cachedIsFirefox = false;
		return false;
	}
	cachedIsFirefox = /Firefox\//.test(navigator.userAgent);
	return cachedIsFirefox;
}

/**
 * Returns `true` when running on WebKit (Safari engine).
 * Only use for genuine browser workarounds, not feature detection.
 */
export function isWebKit(): boolean {
	if (cachedIsWebKit !== undefined) return cachedIsWebKit;
	if (typeof navigator === 'undefined') {
		cachedIsWebKit = false;
		return false;
	}
	cachedIsWebKit =
		/AppleWebKit\//.test(navigator.userAgent) && !/Chrome\//.test(navigator.userAgent);
	return cachedIsWebKit;
}

/** Returns the computed text direction of the given element. */
export function getTextDirection(element: HTMLElement): 'ltr' | 'rtl' {
	const dir: string = getComputedStyle(element).direction;
	return dir === 'rtl' ? 'rtl' : 'ltr';
}

/**
 * Resets cached detection results.
 * Only intended for use in tests.
 */
export function resetPlatformCache(): void {
	cachedIsMac = undefined;
	cachedIsFirefox = undefined;
	cachedIsWebKit = undefined;
}
