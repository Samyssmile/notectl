/**
 * Projects fragment targets from the print shadow tree into the document tree.
 * Browser fragment navigation and PDF named destinations cannot resolve IDs
 * whose root is a ShadowRoot, so each linked block target gets a slotted
 * light-DOM marker at the same rendered position.
 */

import { fragmentIdentifiers } from '../../model/HTMLUtils.js';

export const PRINT_DESTINATION_ATTRIBUTE = 'data-notectl-print-destination';
export const PRINT_DESTINATION_SLOT_ATTRIBUTE = 'data-notectl-print-destination-slot';

export interface PrintDestinationProjection {
	readonly markers: readonly HTMLAnchorElement[];
}

interface Destination {
	readonly id: string;
	readonly marker: HTMLAnchorElement;
}

const VOID_ELEMENTS: ReadonlySet<string> = new Set([
	'AREA',
	'BASE',
	'BR',
	'COL',
	'EMBED',
	'HR',
	'IMG',
	'INPUT',
	'LINK',
	'META',
	'PARAM',
	'SOURCE',
	'TRACK',
	'WBR',
]);

const TABLE_STRUCTURAL_ELEMENTS: ReadonlySet<string> = new Set([
	'TABLE',
	'THEAD',
	'TBODY',
	'TFOOT',
	'TR',
]);

/** Elements whose rendered replacement/fallback UI does not lay out DOM children. */
const REPLACED_ELEMENTS: ReadonlySet<string> = new Set([
	'AUDIO',
	'CANVAS',
	'EMBED',
	'IFRAME',
	'IMG',
	'INPUT',
	'METER',
	'OBJECT',
	'PROGRESS',
	'SELECT',
	'TEXTAREA',
	'VIDEO',
]);

function uniqueToken(prefix: string, used: Set<string>): string {
	let value: string;
	do {
		value = `${prefix}-${crypto.randomUUID()}`;
	} while (used.has(value));
	used.add(value);
	return value;
}

function firstBlockTargets(content: HTMLElement): ReadonlyMap<string, HTMLElement> {
	const targets = new Map<string, HTMLElement>();
	if (content.matches('[data-block-id][id]') && content.id !== '') {
		targets.set(content.id, content);
	}
	for (const target of content.querySelectorAll<HTMLElement>('[data-block-id][id]')) {
		const id: string = target.id;
		if (id !== '' && !targets.has(id)) targets.set(id, target);
	}
	return targets;
}

function blockTargets(content: HTMLElement): HTMLElement[] {
	const targets: HTMLElement[] = [];
	if (content.matches('[data-block-id][id]') && content.id !== '') targets.push(content);
	targets.push(...content.querySelectorAll<HTMLElement>('[data-block-id][id]'));
	return targets;
}

function resolveTarget(
	targets: ReadonlyMap<string, HTMLElement>,
	href: string,
): HTMLElement | undefined {
	for (const identifier of fragmentIdentifiers(href)) {
		const target: HTMLElement | undefined = targets.get(identifier);
		if (target) return target;
	}
	return undefined;
}

/** Inserts a slot at the target without emitting invalid children for void or table elements. */
function insertTargetSlot(target: HTMLElement, slot: HTMLSlotElement): void {
	if (VOID_ELEMENTS.has(target.tagName) || REPLACED_ELEMENTS.has(target.tagName)) {
		target.before(slot);
		return;
	}

	if (TABLE_STRUCTURAL_ELEMENTS.has(target.tagName)) {
		const cell: HTMLElement | null = target.querySelector<HTMLElement>('th, td');
		if (cell) {
			cell.insertBefore(slot, cell.firstChild);
			return;
		}
		const table: HTMLElement | null = target.closest<HTMLElement>('table');
		if (table?.parentNode) {
			table.before(slot);
			return;
		}
	}

	target.insertBefore(slot, target.firstChild);
}

/** Makes a zero-area PDF destination resistant to host/custom anchor styling. */
function resetDestinationMarker(marker: HTMLAnchorElement): void {
	const styles: Readonly<Record<string, string>> = {
		all: 'initial',
		display: 'block',
		position: 'absolute',
		width: '0',
		height: '0',
		margin: '0',
		padding: '0',
		border: '0',
		overflow: 'hidden',
		'pointer-events': 'none',
		'font-size': '0',
		'line-height': '0',
		color: 'transparent',
		background: 'transparent',
	};
	for (const [property, value] of Object.entries(styles)) {
		marker.style.setProperty(property, value, 'important');
	}
}

function createDestination(
	target: HTMLElement,
	document: Document,
	usedIds: Set<string>,
	usedSlotNames: Set<string>,
): Destination {
	const id: string = uniqueToken('notectl-print-destination', usedIds);
	const slotName: string = uniqueToken('notectl-print-destination-slot', usedSlotNames);

	const slot: HTMLSlotElement = document.createElement('slot');
	slot.name = slotName;
	slot.setAttribute(PRINT_DESTINATION_SLOT_ATTRIBUTE, '');
	insertTargetSlot(target, slot);

	const marker: HTMLAnchorElement = document.createElement('a');
	marker.id = id;
	marker.setAttribute('href', `#${id}`);
	marker.slot = slotName;
	marker.tabIndex = -1;
	marker.setAttribute('aria-hidden', 'true');
	marker.setAttribute(PRINT_DESTINATION_ATTRIBUTE, '');
	resetDestinationMarker(marker);

	return { id, marker };
}

/**
 * Namespaces modeled IDs in the no-Shadow-DOM fallback so embedding the print
 * export cannot redirect its links to an earlier same-named consumer element.
 */
export function namespacePrintFallbackTargets(content: HTMLElement): void {
	const targetsByOriginal: ReadonlyMap<string, HTMLElement> = firstBlockTargets(content);
	if (targetsByOriginal.size === 0) return;

	const usedIds = new Set<string>();
	if (content.id !== '') usedIds.add(content.id);
	for (const element of content.querySelectorAll<HTMLElement>('[id]')) usedIds.add(element.id);

	const projectedIds = new Map<HTMLElement, string>();
	for (const target of blockTargets(content)) {
		const id: string = uniqueToken('notectl-print-fallback-destination', usedIds);
		projectedIds.set(target, id);
		target.id = id;
	}

	for (const link of content.querySelectorAll<HTMLAnchorElement>('a[href]')) {
		const target: HTMLElement | undefined = resolveTarget(
			targetsByOriginal,
			link.getAttribute('href') ?? '',
		);
		const id: string | undefined = target ? projectedIds.get(target) : undefined;
		if (id) link.setAttribute('href', `#${id}`);
	}
}

/**
 * Mutates only the supplied print shadow clone. Resolvable fragment-only links
 * are redirected to generated document-tree markers; all other links remain
 * byte-for-byte unchanged.
 */
export function projectPrintDestinations(content: HTMLElement): PrintDestinationProjection {
	const targets: ReadonlyMap<string, HTMLElement> = firstBlockTargets(content);
	if (targets.size === 0) return { markers: [] };

	const document: Document = content.ownerDocument;
	const usedIds = new Set<string>();
	if (content.id !== '') usedIds.add(content.id);
	for (const element of content.querySelectorAll<HTMLElement>('[id]')) {
		usedIds.add(element.id);
	}
	const usedSlotNames = new Set<string>();
	for (const slot of content.querySelectorAll<HTMLSlotElement>('slot[name]')) {
		usedSlotNames.add(slot.name);
	}

	const destinations = new Map<HTMLElement, Destination>();
	const markers: HTMLAnchorElement[] = [];
	for (const link of content.querySelectorAll<HTMLAnchorElement>('a[href]')) {
		const href: string = link.getAttribute('href') ?? '';
		if (!href.startsWith('#')) continue;
		const target: HTMLElement | undefined = resolveTarget(targets, href);
		if (!target) continue;

		let destination: Destination | undefined = destinations.get(target);
		if (!destination) {
			destination = createDestination(target, document, usedIds, usedSlotNames);
			destinations.set(target, destination);
			markers.push(destination.marker);
		}
		link.setAttribute('href', `#${destination.id}`);
	}

	return { markers };
}
