import { describe, expect, it } from 'vitest';
import {
	PRINT_DESTINATION_ATTRIBUTE,
	PRINT_DESTINATION_SLOT_ATTRIBUTE,
	namespacePrintFallbackTargets,
	projectPrintDestinations,
} from './PrintDestinationBridge.js';

function content(html: string): HTMLElement {
	const element: HTMLElement = document.createElement('div');
	element.className = 'notectl-content';
	element.innerHTML = html;
	return element;
}

describe('PrintDestinationBridge', () => {
	it('projects a linked block target into a slotted document-tree marker', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="link"><a href="#chapter">Chapter</a></p>' +
				'<h2 data-block-id="target" id="chapter">Chapter</h2>',
		);

		const projection = projectPrintDestinations(clone);

		expect(projection.markers).toHaveLength(1);
		const marker: HTMLAnchorElement | undefined = projection.markers[0];
		expect(marker).toBeDefined();
		if (!marker) return;

		const link: HTMLAnchorElement | null = clone.querySelector('a');
		const target: HTMLElement | null = clone.querySelector('#chapter');
		const slot: HTMLSlotElement | null = target?.querySelector('slot') ?? null;
		expect(link?.getAttribute('href')).toBe(`#${marker.id}`);
		expect(target?.id).toBe('chapter');
		expect(slot?.name).toBe(marker.slot);
		expect(slot?.hasAttribute(PRINT_DESTINATION_SLOT_ATTRIBUTE)).toBe(true);
		expect(marker.getAttribute('href')).toBe(`#${marker.id}`);
		expect(marker.hasAttribute(PRINT_DESTINATION_ATTRIBUTE)).toBe(true);
		expect(marker.getAttribute('aria-hidden')).toBe('true');
		expect(marker.tabIndex).toBe(-1);
		expect(marker.style.position).toBe('absolute');
		expect(marker.style.display).toBe('block');
		expect(marker.style.getPropertyPriority('display')).toBe('important');
		expect(marker.style.getPropertyValue('all')).toBe('initial');
		expect(marker.style.getPropertyPriority('all')).toBe('important');
	});

	it('shares one destination between links that resolve to the same target', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="a"><a href="#same">First</a></p>' +
				'<p data-block-id="b"><a href="#same">Second</a></p>' +
				'<p data-block-id="target" id="same">Target</p>',
		);

		const projection = projectPrintDestinations(clone);
		const hrefs: string[] = Array.from(clone.querySelectorAll('a')).map(
			(link: HTMLAnchorElement): string => link.getAttribute('href') ?? '',
		);

		expect(projection.markers).toHaveLength(1);
		expect(new Set(hrefs).size).toBe(1);
		expect(clone.querySelectorAll(`slot[${PRINT_DESTINATION_SLOT_ATTRIBUTE}]`)).toHaveLength(1);
	});

	it('uses raw fragment matches before percent-decoded matches', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="link"><a href="#%66oo">Target</a></p>' +
				'<p data-block-id="raw" id="%66oo">Raw</p>' +
				'<p data-block-id="decoded" id="foo">Decoded</p>',
		);

		projectPrintDestinations(clone);
		const targets: HTMLElement[] = Array.from(
			clone.querySelectorAll<HTMLElement>('[data-block-id][id]'),
		);
		const rawTarget: HTMLElement | undefined = targets.find(
			(target: HTMLElement): boolean => target.id === '%66oo',
		);
		const decodedTarget: HTMLElement | undefined = targets.find(
			(target: HTMLElement): boolean => target.id === 'foo',
		);

		expect(rawTarget?.querySelector(`[${PRINT_DESTINATION_SLOT_ATTRIBUTE}]`)).not.toBeNull();
		expect(decodedTarget?.querySelector(`[${PRINT_DESTINATION_SLOT_ATTRIBUTE}]`)).toBeNull();
	});

	it('falls back to the decoded fragment and the first duplicate target in tree order', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="link"><a href="#f%6Fo">Target</a></p>' +
				'<p data-block-id="first" id="foo">First</p>' +
				'<p data-block-id="second" id="foo">Second</p>',
		);

		projectPrintDestinations(clone);
		const targets: NodeListOf<HTMLElement> = clone.querySelectorAll('[data-block-id][id="foo"]');

		expect(targets[0]?.querySelector(`[${PRINT_DESTINATION_SLOT_ATTRIBUTE}]`)).not.toBeNull();
		expect(targets[1]?.querySelector(`[${PRINT_DESTINATION_SLOT_ATTRIBUTE}]`)).toBeNull();
	});

	it('leaves unresolved, non-fragment, empty, and non-block targets untouched', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="links">' +
				'<a href="#missing">Missing</a>' +
				'<a href="https://example.com/#target">External</a>' +
				'<a href="#">Top</a>' +
				'<a href="#inline">Inline</a>' +
				'</p>' +
				'<span id="inline">Not a block root</span>',
		);
		const before: string[] = Array.from(clone.querySelectorAll('a')).map(
			(link: HTMLAnchorElement): string => link.getAttribute('href') ?? '',
		);

		const projection = projectPrintDestinations(clone);
		const after: string[] = Array.from(clone.querySelectorAll('a')).map(
			(link: HTMLAnchorElement): string => link.getAttribute('href') ?? '',
		);

		expect(projection.markers).toHaveLength(0);
		expect(after).toEqual(before);
		expect(clone.querySelector('slot')).toBeNull();
	});

	it('places the projection slot next to a void block target', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="link"><a href="#rule">Rule</a></p>' +
				'<hr data-block-id="rule" id="rule">',
		);

		projectPrintDestinations(clone);
		const target: HTMLElement | null = clone.querySelector('hr');
		const slot: Element | null = target?.previousElementSibling ?? null;

		expect(slot?.tagName).toBe('SLOT');
		expect(slot?.hasAttribute(PRINT_DESTINATION_SLOT_ATTRIBUTE)).toBe(true);
	});

	it('places the projection slot next to a replaced block target', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="link"><a href="#movie">Movie</a></p>' +
				'<video data-block-id="movie" id="movie"></video>',
		);

		projectPrintDestinations(clone);
		const target: HTMLElement | null = clone.querySelector('video');
		const slot: Element | null = target?.previousElementSibling ?? null;

		expect(slot?.tagName).toBe('SLOT');
		expect(slot?.hasAttribute(PRINT_DESTINATION_SLOT_ATTRIBUTE)).toBe(true);
	});

	it('places a table-row destination inside its first cell', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="link"><a href="#row">Row</a></p>' +
				'<table data-block-id="table"><tbody>' +
				'<tr data-block-id="row" id="row"><td data-block-id="cell">Cell</td></tr>' +
				'</tbody></table>',
		);

		projectPrintDestinations(clone);
		const row: HTMLElement | null = clone.querySelector('tr');
		const cell: HTMLElement | null = row?.querySelector('td') ?? null;

		expect(row?.querySelector(':scope > slot')).toBeNull();
		expect(cell?.firstElementChild?.tagName).toBe('SLOT');
		expect(cell?.firstElementChild?.hasAttribute(PRINT_DESTINATION_SLOT_ATTRIBUTE)).toBe(true);
	});
});

describe('namespacePrintFallbackTargets', () => {
	it('rewrites modeled targets and their local links to collision-resistant IDs', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="link"><a href="#chapter">Chapter</a></p>' +
				'<h2 data-block-id="target" id="chapter">Chapter</h2>',
		);

		namespacePrintFallbackTargets(clone);

		const link: HTMLAnchorElement | null = clone.querySelector('a');
		const target: HTMLElement | null = clone.querySelector('h2');
		expect(target?.id).toMatch(/^notectl-print-fallback-destination-/);
		expect(link?.getAttribute('href')).toBe(`#${target?.id}`);
		expect(clone.querySelector('#chapter')).toBeNull();
	});

	it('keeps unresolved and external links unchanged while namespacing every modeled target', () => {
		const clone: HTMLElement = content(
			'<p data-block-id="links"><a href="#missing">Missing</a>' +
				'<a href="https://example.com/#chapter">External</a></p>' +
				'<h2 data-block-id="target" id="chapter">Chapter</h2>',
		);

		namespacePrintFallbackTargets(clone);

		const hrefs: string[] = Array.from(clone.querySelectorAll('a')).map(
			(link: HTMLAnchorElement): string => link.getAttribute('href') ?? '',
		);
		expect(hrefs).toEqual(['#missing', 'https://example.com/#chapter']);
		expect(clone.querySelector('h2')?.id).toMatch(/^notectl-print-fallback-destination-/);
	});
});
