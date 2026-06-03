import { describe, expect, it } from 'vitest';
import { registerBuiltinSpecs } from '../../editor/BuiltinSpecs.js';
import { type BlockNode, createBlockNode, createDocument } from '../../model/Document.js';
import type { ParseRule } from '../../model/ParseRule.js';
import { SchemaRegistry } from '../../model/SchemaRegistry.js';
import { nodeType } from '../../model/TypeBrands.js';
import { parseHTMLToDocument } from '../../serialization/DocumentParser.js';
import { serializeDocumentToHTML } from '../../serialization/DocumentSerializer.js';
import { VIDEO_LOCALE_EN } from './VideoLocale.js';
import { createVideoNodeSpec } from './VideoNodeSpec.js';
import { DEFAULT_VIDEO_CONFIG } from './VideoTypes.js';

const ID = 'dQw4w9WgXcQ';
const spec = createVideoNodeSpec(DEFAULT_VIDEO_CONFIG, VIDEO_LOCALE_EN);

function element(html: string): HTMLElement {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content.firstElementChild as HTMLElement;
}

function rule(tag: string): ParseRule {
	const found = spec.parseHTML?.find((r) => r.tag === tag);
	if (!found) throw new Error(`no parse rule for ${tag}`);
	return found;
}

describe('video toHTML', () => {
	const node: BlockNode = createBlockNode(nodeType('video'), [], 'vid1', {
		provider: 'youtube',
		videoId: ID,
		aspectRatio: '16 / 9',
		widthPercent: 75,
		align: 'center',
		title: 'How to set up notectl',
		caption: 'A short demo',
		privacy: true,
	});

	it('emits a privacy-preserving figure, never an iframe', () => {
		const html = spec.toHTML?.(node, '', undefined) ?? '';
		expect(html).toContain('data-video-provider="youtube"');
		expect(html).toContain(`data-video-id="${ID}"`);
		expect(html).toContain('data-video-title="How to set up notectl"');
		expect(html).toContain('data-video-width="75"');
		expect(html).toContain(`href="https://www.youtube.com/watch?v=${ID}"`);
		expect(html).toContain('<figcaption>A short demo</figcaption>');
		expect(html).not.toContain('<iframe');
	});

	it('omits the provider thumbnail by default (privacy)', () => {
		const html = spec.toHTML?.(node, '', undefined) ?? '';
		expect(html).not.toContain('ytimg.com');
		expect(html).not.toContain('<img');
	});
});

describe('video parseHTML — figure', () => {
	it('reconstructs attributes from data-video-*', () => {
		const figure = element(
			`<figure data-video-provider="youtube" data-video-id="${ID}" data-video-ratio="16 / 9" data-video-width="50" data-video-privacy="true" data-video-title="My Title"><a href="x">My Title</a><figcaption>Cap</figcaption></figure>`,
		);
		expect(rule('figure').getAttrs?.(figure)).toMatchObject({
			provider: 'youtube',
			videoId: ID,
			aspectRatio: '16 / 9',
			widthPercent: 50,
			title: 'My Title',
			caption: 'Cap',
			privacy: true,
		});
	});

	it('rejects a non-video figure', () => {
		expect(rule('figure').getAttrs?.(element('<figure><img src="x.png"></figure>'))).toBe(false);
	});
});

describe('video parseHTML — iframe tolerance', () => {
	it('reconstructs a known-provider embed iframe', () => {
		const iframe = element(
			`<iframe src="https://www.youtube-nocookie.com/embed/${ID}" title="My Video" width="640" height="360"></iframe>`,
		);
		expect(rule('iframe').getAttrs?.(iframe)).toMatchObject({
			provider: 'youtube',
			videoId: ID,
			title: 'My Video',
		});
	});

	it('rejects an unknown iframe', () => {
		expect(rule('iframe').getAttrs?.(element('<iframe src="https://evil.com/x"></iframe>'))).toBe(
			false,
		);
	});
});

describe('video HTML round-trip', () => {
	it('preserves data-block-id and attributes through serialize → parse', () => {
		const registry = new SchemaRegistry();
		registerBuiltinSpecs(registry);
		registry.registerNodeSpec(createVideoNodeSpec(DEFAULT_VIDEO_CONFIG, VIDEO_LOCALE_EN));

		const video: BlockNode = createBlockNode(nodeType('video'), [], 'vid-1', {
			provider: 'youtube',
			videoId: ID,
			aspectRatio: '16 / 9',
			widthPercent: 50,
			align: 'center',
			title: 'Round Trip',
			privacy: true,
		});
		const html = serializeDocumentToHTML(createDocument([video]), registry);
		expect(html).toContain('data-block-id="vid-1"');
		expect(html).not.toContain('<iframe');

		const parsed = parseHTMLToDocument(html, registry);
		const restored: BlockNode | undefined = parsed.children.find((b) => b.type === 'video');
		expect(restored?.id).toBe('vid-1');
		expect(restored?.attrs?.provider).toBe('youtube');
		expect(restored?.attrs?.videoId).toBe(ID);
		expect(restored?.attrs?.title).toBe('Round Trip');
		expect(restored?.attrs?.widthPercent).toBe(50);
	});
});
