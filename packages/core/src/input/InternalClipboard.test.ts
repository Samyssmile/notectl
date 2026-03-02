import { describe, expect, it } from 'vitest';
import { clearRichClipboard, consumeRichClipboard, setRichClipboard } from './InternalClipboard.js';

describe('InternalClipboard text normalization', () => {
	it('matches plain text with CRLF line endings', () => {
		setRichClipboard('line1\nline2', [
			{ type: 'paragraph', text: 'line1' },
			{ type: 'paragraph', text: 'line2' },
		]);

		const result = consumeRichClipboard('line1\r\nline2');
		expect(result).toBeDefined();
		expect(result).toHaveLength(2);

		clearRichClipboard();
	});

	it('matches plain text with CR line endings', () => {
		setRichClipboard('line1\nline2', [
			{ type: 'paragraph', text: 'line1' },
			{ type: 'paragraph', text: 'line2' },
		]);

		const result = consumeRichClipboard('line1\rline2');
		expect(result).toBeDefined();
		expect(result).toHaveLength(2);

		clearRichClipboard();
	});

	it('matches when stored with CRLF and consumed with LF', () => {
		setRichClipboard('line1\r\nline2', [
			{ type: 'heading', text: 'line1' },
			{ type: 'paragraph', text: 'line2' },
		]);

		const result = consumeRichClipboard('line1\nline2');
		expect(result).toBeDefined();
		expect(result).toHaveLength(2);

		clearRichClipboard();
	});

	it('preserves segments in rich block data', () => {
		const blocks = [
			{
				type: 'paragraph',
				text: 'hello world',
				segments: [
					{ text: 'hello ', marks: [] },
					{ text: 'world', marks: [{ type: 'bold' }] },
				],
			},
		];
		setRichClipboard('hello world', blocks);

		const result = consumeRichClipboard('hello world');
		expect(result).toBeDefined();
		expect(result?.[0]?.segments).toHaveLength(2);
		expect(result?.[0]?.segments?.[1]?.marks[0]?.type).toBe('bold');

		clearRichClipboard();
	});

	it('returns undefined for non-matching text', () => {
		setRichClipboard('abc', [{ type: 'paragraph', text: 'abc' }]);

		const result = consumeRichClipboard('xyz');
		expect(result).toBeUndefined();

		clearRichClipboard();
	});
});
