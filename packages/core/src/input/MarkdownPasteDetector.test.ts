import { describe, expect, it } from 'vitest';
import { looksLikeMarkdown } from './MarkdownPasteDetector.js';

describe('looksLikeMarkdown', () => {
	it('detects fenced code blocks', () => {
		expect(looksLikeMarkdown('```ts\nconst x = 1;\n```')).toBe(true);
		expect(looksLikeMarkdown('~~~\ncode\n~~~')).toBe(true);
	});

	it('detects GFM tables', () => {
		expect(looksLikeMarkdown('| H1 | H2 |\n| --- | --- |\n| a | b |')).toBe(true);
	});

	it('detects a run of block markers', () => {
		expect(looksLikeMarkdown('- one\n- two\n- three')).toBe(true);
		expect(looksLikeMarkdown('# Heading\n\nsome text\n\n## Another')).toBe(true);
		expect(looksLikeMarkdown('1. first\n2. second')).toBe(true);
		expect(looksLikeMarkdown('> quote line one\n> quote line two')).toBe(true);
	});

	it('does NOT trigger on ordinary prose with stray inline punctuation', () => {
		expect(looksLikeMarkdown('Use the * key and the _ key for now.')).toBe(false);
		expect(looksLikeMarkdown('A sentence with *one* emphasis only.')).toBe(false);
		expect(looksLikeMarkdown('Plain paragraph with no structure at all.')).toBe(false);
	});

	it('does NOT trigger on a single block marker (ambiguous)', () => {
		expect(looksLikeMarkdown('# Just one heading line')).toBe(false);
		expect(looksLikeMarkdown('- single bullet')).toBe(false);
	});

	it('does NOT trigger on empty input', () => {
		expect(looksLikeMarkdown('')).toBe(false);
	});

	// Accepted false positive (documented waiver, #192): code copied from a
	// terminal whose `# ` comments read as ATX headings is treated as Markdown.
	// The run-of-markers signal cannot be tightened without breaking genuine
	// Markdown (a two-item list, consecutive headings), so this is intentional.
	// Pinned as a regression guard, not a bug. Escape hatch: markdown: { paste: 'never' }.
	it('intentionally treats >=2 plain-text comment/list lines as Markdown', () => {
		expect(looksLikeMarkdown('# disable feature flag\n# bump the timeout')).toBe(true);
	});

	it('does NOT treat a pipe-containing prose line as a table', () => {
		expect(looksLikeMarkdown('the command is `a | b` piping output')).toBe(false);
	});
});
