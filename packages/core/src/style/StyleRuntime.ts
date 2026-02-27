/**
 * Runtime style abstraction.
 *
 * - `inline` mode writes directly to `HTMLElement.style` (legacy behavior)
 * - `strict` mode writes no inline styles and instead assigns token attributes
 *   backed by dynamic CSS rules in a stylesheet.
 */

export type RuntimeStyleMode = 'inline' | 'strict';

export interface StyleRootOptions {
	readonly mode: RuntimeStyleMode;
	readonly nonce?: string;
	readonly sheet?: CSSStyleSheet | null;
}

type StyleRoot = ShadowRoot | Document;

interface RootConfig {
	readonly mode: RuntimeStyleMode;
	readonly nonce?: string;
	readonly sheet: CSSStyleSheet | null;
}

const STYLE_TOKEN_ATTR = 'data-notectl-style-token';
const STYLE_ELEMENT_ATTR = 'data-notectl-runtime-styles';

const rootConfigs: WeakMap<StyleRoot, RootConfig> = new WeakMap();
const strictEngines: WeakMap<StyleRoot, StrictStyleEngine> = new WeakMap();

/** Creates a constructable stylesheet when the environment supports it. */
export function createRuntimeStyleSheet(): CSSStyleSheet | null {
	if (typeof CSSStyleSheet === 'undefined') return null;
	try {
		return new CSSStyleSheet();
	} catch {
		return null;
	}
}

/** Registers styling mode for a root (shadow root or document). */
export function registerStyleRoot(root: StyleRoot, options: StyleRootOptions): void {
	const previous = strictEngines.get(root);
	if (previous) {
		previous.destroy();
		strictEngines.delete(root);
	}
	rootConfigs.set(root, {
		mode: options.mode,
		nonce: options.nonce,
		sheet: options.sheet ?? null,
	});
}

/** Unregisters root styling and tears down strict runtime state if present. */
export function unregisterStyleRoot(root: StyleRoot): void {
	const engine = strictEngines.get(root);
	if (engine) {
		engine.destroy();
		strictEngines.delete(root);
	}
	rootConfigs.delete(root);
}

/** Sets a single style property. Empty value removes the property. */
export function setStyleProperty(el: HTMLElement, property: string, value: string): void {
	const config = resolveConfig(el);
	if (!config || config.mode === 'inline') {
		setInlineProperty(el, property, value);
		return;
	}
	getStrictEngine(config.root, config.settings).setProperty(el, property, value);
}

/** Removes a single style property. */
export function removeStyleProperty(el: HTMLElement, property: string): void {
	setStyleProperty(el, property, '');
}

/** Sets multiple style properties in one call. */
export function setStyleProperties(
	el: HTMLElement,
	properties: Readonly<Record<string, string | undefined | null>>,
): void {
	const config = resolveConfig(el);
	if (!config || config.mode === 'inline') {
		for (const [property, value] of Object.entries(properties)) {
			setInlineProperty(el, property, value ?? '');
		}
		return;
	}
	getStrictEngine(config.root, config.settings).setProperties(el, properties);
}

/** Replaces the element style text. */
export function setStyleText(el: HTMLElement, cssText: string): void {
	const config = resolveConfig(el);
	if (!config || config.mode === 'inline') {
		el.style.cssText = cssText;
		return;
	}
	getStrictEngine(config.root, config.settings).setStyleText(el, cssText);
}

/** Merges a cssText fragment into current element styles. */
export function appendStyleText(el: HTMLElement, cssText: string): void {
	const config = resolveConfig(el);
	if (!config || config.mode === 'inline') {
		const current = el.style.cssText;
		el.style.cssText = current ? `${current}; ${cssText}` : cssText;
		return;
	}
	getStrictEngine(config.root, config.settings).appendStyleText(el, cssText);
}

/** Alias for legacy `setAttribute('style', ...)` sites. */
export function setStyleAttribute(el: HTMLElement, cssText: string): void {
	setStyleText(el, cssText);
}

/** Returns serialized styles for an element. */
export function getStyleText(el: HTMLElement): string {
	const config = resolveConfig(el);
	if (!config || config.mode === 'inline') return el.style.cssText;
	return getStrictEngine(config.root, config.settings).getStyleText(el);
}

/** Returns the configured CSP nonce for the node's style root (if any). */
export function getStyleNonceForNode(node: Node): string | undefined {
	const root = resolveStyleRootFromNode(node);
	if (!root) return undefined;
	return rootConfigs.get(root)?.nonce;
}

function setInlineProperty(el: HTMLElement, property: string, value: string): void {
	if (property.startsWith('--')) {
		if (value) {
			el.style.setProperty(property, value);
		} else {
			el.style.removeProperty(property);
		}
		return;
	}
	if (property.includes('-')) {
		if (value) {
			el.style.setProperty(property, value);
		} else {
			el.style.removeProperty(property);
		}
		return;
	}
	(el.style as CSSStyleDeclaration & Record<string, string>)[property] = value;
}

function resolveConfig(
	el: HTMLElement,
): { root: StyleRoot; mode: RuntimeStyleMode; settings: RootConfig } | null {
	const root = resolveStyleRoot(el);
	if (!root) return null;
	const settings = rootConfigs.get(root);
	if (!settings) return null;
	return { root, mode: settings.mode, settings };
}

function resolveStyleRoot(el: HTMLElement): StyleRoot | null {
	return resolveStyleRootFromNode(el);
}

function getStrictEngine(root: StyleRoot, config: RootConfig): StrictStyleEngine {
	const cached = strictEngines.get(root);
	if (cached) return cached;
	const engine = new StrictStyleEngine(root, config);
	strictEngines.set(root, engine);
	return engine;
}

function isShadowRoot(value: unknown): value is ShadowRoot {
	return typeof ShadowRoot !== 'undefined' && value instanceof ShadowRoot;
}

function isDocument(value: unknown): value is Document {
	return typeof Document !== 'undefined' && value instanceof Document;
}

function resolveStyleRootFromNode(node: Node): StyleRoot | null {
	const rootNode: Node = isShadowRoot(node) || isDocument(node) ? node : node.getRootNode();
	if (isShadowRoot(rootNode)) return rootNode;
	if (isDocument(rootNode)) return rootNode;
	if (typeof document !== 'undefined') return document;
	return null;
}

class StrictStyleEngine {
	private readonly declarationByElement: WeakMap<HTMLElement, Map<string, string>> = new WeakMap();
	private readonly tokenByDeclaration: Map<string, string> = new Map();
	private tokenCounter = 0;
	private readonly root: StyleRoot;
	private readonly nonce?: string;
	private sheet: CSSStyleSheet | null;
	private fallbackStyleElement: HTMLStyleElement | null = null;

	constructor(root: StyleRoot, config: RootConfig) {
		this.root = root;
		this.nonce = config.nonce;
		this.sheet = config.sheet ?? null;
	}

	destroy(): void {
		this.fallbackStyleElement?.remove();
		this.fallbackStyleElement = null;
	}

	setProperty(el: HTMLElement, property: string, value: string): void {
		const declarations = this.getOrCreateDeclarations(el);
		const name = normalizePropertyName(property);
		if (!value) {
			declarations.delete(name);
		} else {
			declarations.set(name, value);
		}
		this.syncElementToken(el, declarations);
	}

	setProperties(
		el: HTMLElement,
		properties: Readonly<Record<string, string | undefined | null>>,
	): void {
		const declarations = this.getOrCreateDeclarations(el);
		for (const [property, value] of Object.entries(properties)) {
			const name = normalizePropertyName(property);
			if (!value) {
				declarations.delete(name);
			} else {
				declarations.set(name, value);
			}
		}
		this.syncElementToken(el, declarations);
	}

	setStyleText(el: HTMLElement, cssText: string): void {
		const declarations = parseStyleText(cssText);
		if (declarations.size === 0) {
			this.declarationByElement.delete(el);
			el.removeAttribute(STYLE_TOKEN_ATTR);
			return;
		}
		this.declarationByElement.set(el, declarations);
		this.syncElementToken(el, declarations);
	}

	appendStyleText(el: HTMLElement, cssText: string): void {
		const parsed = parseStyleText(cssText);
		if (parsed.size === 0) return;
		const declarations = this.getOrCreateDeclarations(el);
		for (const [property, value] of parsed) {
			declarations.set(property, value);
		}
		this.syncElementToken(el, declarations);
	}

	getStyleText(el: HTMLElement): string {
		const declarations = this.declarationByElement.get(el);
		if (!declarations || declarations.size === 0) return '';
		return serializeDeclarations(declarations);
	}

	private getOrCreateDeclarations(el: HTMLElement): Map<string, string> {
		const existing = this.declarationByElement.get(el);
		if (existing) return existing;
		const created = new Map<string, string>();
		this.declarationByElement.set(el, created);
		return created;
	}

	private syncElementToken(el: HTMLElement, declarations: Map<string, string>): void {
		if (declarations.size === 0) {
			this.declarationByElement.delete(el);
			el.removeAttribute(STYLE_TOKEN_ATTR);
			return;
		}

		const declarationText = serializeDeclarations(declarations);
		let token = this.tokenByDeclaration.get(declarationText);
		if (!token) {
			token = `s${this.tokenCounter.toString(36)}`;
			this.tokenCounter += 1;
			this.tokenByDeclaration.set(declarationText, token);
			this.insertRule(token, declarationText);
		}
		el.setAttribute(STYLE_TOKEN_ATTR, token);
	}

	private insertRule(token: string, declarationText: string): void {
		const rule = `[${STYLE_TOKEN_ATTR}="${token}"] { ${declarationText}; }`;
		const sheet = this.ensureSheet();
		if (!sheet) return;
		try {
			sheet.insertRule(rule, sheet.cssRules.length);
		} catch {
			// Ignore malformed declarations from third-party plugin attrs.
		}
	}

	private ensureSheet(): CSSStyleSheet | null {
		if (this.sheet) return this.sheet;

		if (typeof CSSStyleSheet !== 'undefined') {
			try {
				const sheet = new CSSStyleSheet();
				if ('adoptedStyleSheets' in this.root) {
					const adopted = this.root.adoptedStyleSheets;
					this.root.adoptedStyleSheets = [...adopted, sheet];
					this.sheet = sheet;
					return sheet;
				}
			} catch {
				// Fall through to style element fallback.
			}
		}

		const style = this.ensureFallbackStyleElement();
		this.sheet = (style.sheet as CSSStyleSheet | null) ?? null;
		return this.sheet;
	}

	private ensureFallbackStyleElement(): HTMLStyleElement {
		if (this.fallbackStyleElement) return this.fallbackStyleElement;
		const style: HTMLStyleElement = document.createElement('style');
		style.setAttribute(STYLE_ELEMENT_ATTR, '');
		if (this.nonce) {
			style.setAttribute('nonce', this.nonce);
		}
		if (isShadowRoot(this.root)) {
			this.root.appendChild(style);
		} else {
			const host = this.root.head ?? this.root.documentElement;
			host.appendChild(style);
		}
		this.fallbackStyleElement = style;
		return style;
	}
}

function parseStyleText(styleText: string): Map<string, string> {
	const declarations = new Map<string, string>();
	for (const rawPart of styleText.split(';')) {
		const part = rawPart.trim();
		if (!part) continue;
		const separator = part.indexOf(':');
		if (separator <= 0) continue;
		const property = normalizePropertyName(part.slice(0, separator));
		const value = part.slice(separator + 1).trim();
		if (!value) {
			declarations.delete(property);
		} else {
			declarations.set(property, value);
		}
	}
	return declarations;
}

function serializeDeclarations(declarations: Map<string, string>): string {
	const ordered: [string, string][] = Array.from(declarations.entries()).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	return ordered.map(([property, value]) => `${property}: ${value}`).join('; ');
}

function normalizePropertyName(property: string): string {
	const trimmed = property.trim();
	if (!trimmed) return '';
	if (trimmed.startsWith('--')) return trimmed;
	if (trimmed.includes('-')) return trimmed.toLowerCase();
	return trimmed.replace(/[A-Z]/g, (char: string) => `-${char.toLowerCase()}`).toLowerCase();
}
