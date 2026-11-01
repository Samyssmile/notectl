import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollapsedSelection } from '../../model/Selection.js';
import { blockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { mockPluginContext, stateBuilder } from '../../test/TestUtils.js';
import { renderLinkBubble } from './LinkBubbleContent.js';
import { LINK_LOCALE_EN } from './LinkLocale.js';

function fixture() {
	let state: EditorState = stateBuilder()
		.paragraph('linked', 'b1', {
			marks: [{ type: 'link', attrs: { href: '/old', title: 'Title' } }],
		})
		.cursor('b1', 2)
		.schema(['paragraph'], ['link'])
		.build();
	const editor = document.createElement('div');
	const popup = document.createElement('div');
	document.body.append(editor, popup);
	let readonly = false;
	const context = mockPluginContext({
		getContainer: () => editor,
		getState: () => state,
		isReadOnly: () => readonly,
	});
	const close = vi.fn();
	renderLinkBubble(popup, context, LINK_LOCALE_EN, close);
	popup.querySelector<HTMLButtonElement>('[aria-label="Edit link"]')?.click();
	const input = popup.querySelector('input');
	if (!input) throw new Error('Missing form');
	const apply = () =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
		);
	return {
		context,
		popup,
		input,
		apply,
		close,
		setState: (next: EditorState) => {
			state = next;
		},
		setReadonly: () => {
			readonly = true;
		},
	};
}
afterEach(() => document.body.replaceChildren());
describe('shared link edit form', () => {
	it('prefills the URL and applies after caret movement within the same link', () => {
		const f = fixture();
		expect(f.input.value).toBe('/old');
		f.setState(f.context.getState().withSelection(createCollapsedSelection(blockId('b1'), 4)));
		f.input.value = '/new';
		f.apply();
		expect(f.context.dispatch).toHaveBeenCalledOnce();
		expect(f.close).toHaveBeenCalledOnce();
	});
	it.each(['', 'javascript:alert(1)'])('keeps invalid URL %s editable', (raw) => {
		const f = fixture();
		f.input.value = raw;
		f.apply();
		expect(f.input.getAttribute('aria-invalid')).toBe('true');
		expect(f.popup.querySelector<HTMLElement>('[role="alert"]')?.hidden).toBe(false);
		expect(f.context.dispatch).not.toHaveBeenCalled();
		expect(f.close).not.toHaveBeenCalled();
		f.input.dispatchEvent(new Event('input'));
		expect(f.input.hasAttribute('aria-invalid')).toBe(false);
	});
	it('does not dispatch when the URL is unchanged', () => {
		const f = fixture();
		f.apply();
		expect(f.context.dispatch).not.toHaveBeenCalled();
		expect(f.close).toHaveBeenCalledOnce();
	});
	it('rejects an outdated target after document replacement', () => {
		const f = fixture();
		f.setState(stateBuilder().paragraph('replacement', 'b1').build());
		f.input.value = '/new';
		f.apply();
		expect(f.context.dispatch).not.toHaveBeenCalled();
	});
	it('rejects edits after switching to readonly', () => {
		const f = fixture();
		f.setReadonly();
		f.input.value = '/new';
		f.apply();
		expect(f.context.dispatch).not.toHaveBeenCalled();
	});
	it('cancels without dispatch and preserves input navigation keys', () => {
		const f = fixture();
		const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
		f.input.dispatchEvent(space);
		expect(space.defaultPrevented).toBe(false);
		f.input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
		);
		expect(f.context.dispatch).not.toHaveBeenCalled();
		expect(f.close).toHaveBeenCalledOnce();
	});
});
