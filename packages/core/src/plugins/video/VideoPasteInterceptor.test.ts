import { describe, expect, it, vi } from 'vitest';
import { getBlockText } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { Transaction } from '../../state/Transaction.js';
import { stateBuilder } from '../../test/TestUtils.js';
import { createVideoPasteInterceptor } from './VideoPasteInterceptor.js';
import { DEFAULT_VIDEO_PROVIDERS } from './VideoProviders.js';

const ID = 'dQw4w9WgXcQ';

function caretState() {
	return stateBuilder()
		.paragraph('', 'b1')
		.cursor('b1', 0)
		.schema(['paragraph', 'video'], [])
		.build();
}

function makeInterceptor(onOffer = vi.fn()) {
	return {
		onOffer,
		interceptor: createVideoPasteInterceptor({ providers: DEFAULT_VIDEO_PROVIDERS, onOffer }),
	};
}

describe('createVideoPasteInterceptor', () => {
	it('claims a sole video URL, inserts it as text, and offers an embed', () => {
		const { interceptor, onOffer } = makeInterceptor();
		const state = caretState();
		const url = `https://youtu.be/${ID}`;

		const tr: Transaction | null = interceptor(url, '', state);
		expect(tr).not.toBeNull();
		expect(onOffer).toHaveBeenCalledTimes(1);

		if (!tr) throw new Error('expected a transaction');
		const applied = state.apply(tr);
		const block = applied.getBlock('b1' as BlockId);
		expect(block && getBlockText(block)).toBe(url);
	});

	it('passes through plain non-video text', () => {
		const { interceptor, onOffer } = makeInterceptor();
		expect(interceptor('hello world', '', caretState())).toBeNull();
		expect(onOffer).not.toHaveBeenCalled();
	});

	it('passes through a URL that is not the sole clipboard content', () => {
		const { interceptor } = makeInterceptor();
		expect(interceptor(`watch https://youtu.be/${ID} now`, '', caretState())).toBeNull();
	});

	it('extracts a standalone embed iframe from the clipboard html', () => {
		const { interceptor, onOffer } = makeInterceptor();
		const iframe = `<iframe src="https://www.youtube-nocookie.com/embed/${ID}"></iframe>`;
		const tr = interceptor(iframe, iframe, caretState());
		expect(tr).not.toBeNull();
		expect(onOffer).toHaveBeenCalledTimes(1);
	});
});
