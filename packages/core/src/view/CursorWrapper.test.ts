import { describe, expect, it } from 'vitest';
import { markType } from '../model/TypeBrands.js';
import { stateBuilder } from '../test/TestUtils.js';
import { CursorWrapper } from './CursorWrapper.js';

function setup(): { container: HTMLElement; wrapper: CursorWrapper } {
	const container: HTMLElement = document.createElement('div');
	container.setAttribute('contenteditable', 'true');
	document.body.appendChild(container);

	// Create a text node and position the browser cursor inside it
	const p: HTMLElement = document.createElement('p');
	p.setAttribute('data-block-id', 'b1');
	const textNode: Text = document.createTextNode('Hello');
	p.appendChild(textNode);
	container.appendChild(p);

	// Attempt to set selection (happy-dom may not fully support this)
	try {
		const sel = window.getSelection();
		if (sel) {
			sel.collapse(textNode, 3);
		}
	} catch {
		// happy-dom may not support this fully
	}

	const wrapper = new CursorWrapper(container);
	return { container, wrapper };
}

function teardown(container: HTMLElement): void {
	container.remove();
}

describe('CursorWrapper', () => {
	it('is not active initially', () => {
		const { container, wrapper } = setup();
		expect(wrapper.isActive).toBe(false);
		teardown(container);
	});

	it('creates wrapper element when storedMarks are present', () => {
		const { container, wrapper } = setup();
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['bold'])
			.build();
		const withMarks = state.apply(
			state
				.transaction('command')
				.setStoredMarks([{ type: markType('bold') }], null)
				.build(),
		);

		wrapper.onCompositionStart(withMarks);

		// Verify the wrapper was created in the DOM
		const cursorWrapperEl = container.querySelector('[data-cursor-wrapper]');
		if (!cursorWrapperEl) {
			expect.unreachable('Expected cursor-wrapper element in DOM');
			return;
		}
		expect(wrapper.isActive).toBe(true);
		expect(cursorWrapperEl.textContent).toContain('\u200B');
		// Should have a <strong> wrapper for bold
		expect(cursorWrapperEl.querySelector('strong')).not.toBeNull();
		teardown(container);
	});

	it('does not create wrapper when no storedMarks', () => {
		const { container, wrapper } = setup();
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['bold'])
			.build();

		wrapper.onCompositionStart(state);
		expect(wrapper.isActive).toBe(false);
		expect(container.querySelector('[data-cursor-wrapper]')).toBeNull();
		teardown(container);
	});

	it('does not create wrapper for empty storedMarks array', () => {
		const { container, wrapper } = setup();
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['bold'])
			.build();
		const withEmptyMarks = state.apply(
			state.transaction('command').setStoredMarks([], null).build(),
		);

		wrapper.onCompositionStart(withEmptyMarks);
		expect(wrapper.isActive).toBe(false);
		teardown(container);
	});

	it('cleanup removes the wrapper from DOM', () => {
		const { container, wrapper } = setup();
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['bold'])
			.build();
		const withMarks = state.apply(
			state
				.transaction('command')
				.setStoredMarks([{ type: markType('bold') }], null)
				.build(),
		);

		wrapper.onCompositionStart(withMarks);
		wrapper.cleanup();

		expect(wrapper.isActive).toBe(false);
		expect(container.querySelector('[data-cursor-wrapper]')).toBeNull();
		teardown(container);
	});

	it('cleanup is safe to call multiple times', () => {
		const { container, wrapper } = setup();
		wrapper.cleanup();
		wrapper.cleanup();
		expect(wrapper.isActive).toBe(false);
		teardown(container);
	});

	it('does not create wrapper for NodeSelection', () => {
		const { container, wrapper } = setup();
		const state = stateBuilder().voidBlock('horizontal_rule', 'hr1').nodeSelection('hr1').build();

		wrapper.onCompositionStart(state);
		expect(wrapper.isActive).toBe(false);
		teardown(container);
	});

	it('does not create wrapper for GapCursor', () => {
		const { container, wrapper } = setup();
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'hr1')
			.gapCursor('hr1', 'before')
			.build();

		wrapper.onCompositionStart(state);
		expect(wrapper.isActive).toBe(false);
		teardown(container);
	});
});
