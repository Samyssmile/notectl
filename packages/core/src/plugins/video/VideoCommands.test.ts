import { describe, expect, it, vi } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createTextNode,
	getBlockChildren,
	getBlockText,
} from '../../model/Document.js';
import type { NodeSpec } from '../../model/NodeSpec.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { mockPluginContext, stateBuilder } from '../../test/TestUtils.js';
import type { PluginContext } from '../Plugin.js';
import { createTable } from '../table/TableHelpers.js';
import {
	applyVideoEdit,
	insertVideo,
	insertVideoReplacingRange,
	removeVideo,
	resetVideoSize,
	resizeVideoByDelta,
	setVideoAlign,
} from './VideoCommands.js';
import { DEFAULT_VIDEO_CONFIG } from './VideoTypes.js';
import type { VideoAttrs } from './VideoTypes.js';

const ID = 'dQw4w9WgXcQ';
const VIDEO_ATTRS: VideoAttrs = {
	provider: 'youtube',
	videoId: ID,
	aspectRatio: '16 / 9',
	widthPercent: 100,
	align: 'center',
	title: 'Demo',
	privacy: true,
};

/** A live context whose dispatch applies transactions to a mutable state. */
function harness(initial: EditorState) {
	let state = initial;
	const dispatch = vi.fn((tr) => {
		state = state.apply(tr);
	});
	const ctx: PluginContext = mockPluginContext({ getState: () => state, dispatch });
	return { ctx, getState: () => state, dispatch };
}

function selectedVideoState(attrs: VideoAttrs = VIDEO_ATTRS): EditorState {
	const video: BlockNode = createBlockNode(nodeType('video'), [], 'v1' as BlockId, attrs);
	const para: BlockNode = createBlockNode(
		nodeType('paragraph'),
		[createTextNode('')],
		'p1' as BlockId,
	);
	return EditorState.create({
		doc: { children: [video, para] },
		selection: createNodeSelection('v1' as BlockId, []),
		schema: { nodeTypes: ['paragraph', 'video'], markTypes: [] },
	});
}

/** Reports the given node types as void, mirroring how the production schema does. */
function voidNodeSpec(voidTypes: readonly string[]): (type: string) => NodeSpec | undefined {
	return (type: string): NodeSpec | undefined =>
		voidTypes.includes(type) ? ({ isVoid: true } as unknown as NodeSpec) : undefined;
}

describe('insertVideo', () => {
	it('inserts a video and trailing paragraph at root, selecting the node', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph', 'video'], [])
			.build();
		const { ctx, getState } = harness(state);

		expect(insertVideo(ctx, VIDEO_ATTRS)).toBe(true);
		const children = getState().doc.children;
		expect(children.map((b) => b.type)).toEqual(['paragraph', 'video', 'paragraph']);
		expect(isNodeSelection(getState().selection)).toBe(true);
	});

	it('inserts a video into a table cell', () => {
		const table: BlockNode = createTable(2, 2);
		const cell: BlockNode = getBlockChildren(
			getBlockChildren(table)[0] as BlockNode,
		)[0] as BlockNode;
		const state = EditorState.create({
			doc: { children: [table] },
			selection: createCollapsedSelection(cell.id, 0),
			schema: {
				nodeTypes: ['paragraph', 'video', 'table', 'table_row', 'table_cell'],
				markTypes: [],
			},
		});
		const { ctx, getState } = harness(state);

		expect(insertVideo(ctx, VIDEO_ATTRS)).toBe(true);
		const updatedCell = getState().getBlock(cell.id);
		expect(getBlockChildren(updatedCell as BlockNode)[0]?.type).toBe('video');
	});

	it('reuses a void block trailing paragraph instead of stacking a blank line (#158)', () => {
		// After inserting an image the selection rests on that void block as a node
		// selection, and the image already owns a trailing empty paragraph as its
		// escape line. Inserting a video next must reuse that paragraph rather than
		// append a second one, so no stray blank line stacks up.
		const state = stateBuilder()
			.voidBlock('image', 'img1')
			.paragraph('', 'p1')
			.nodeSelection('img1')
			.schema(['paragraph', 'video', 'image'], [], voidNodeSpec(['image', 'video']))
			.build();
		const { ctx, getState } = harness(state);

		expect(insertVideo(ctx, VIDEO_ATTRS)).toBe(true);
		expect(getState().doc.children.map((b) => b.type)).toEqual(['image', 'video', 'paragraph']);
	});

	it('consumes an empty-paragraph anchor instead of leaving a leading blank line', () => {
		// Inserting into an empty paragraph places the video on that line rather than
		// below it, matching how image insertion already behaves (#152).
		const state = stateBuilder()
			.paragraph('', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph', 'video'], [], voidNodeSpec(['video']))
			.build();
		const { ctx, getState } = harness(state);

		expect(insertVideo(ctx, VIDEO_ATTRS)).toBe(true);
		expect(getState().doc.children.map((b) => b.type)).toEqual(['video', 'paragraph']);
	});
});

describe('attribute updates', () => {
	it('sets alignment on the selected video', () => {
		const { ctx, getState } = harness(selectedVideoState());
		expect(setVideoAlign(ctx, 'start')).toBe(true);
		expect(getState().getBlock('v1' as BlockId)?.attrs?.align).toBe('start');
	});

	it('resizes by a delta and clamps to the minimum width', () => {
		const { ctx, getState } = harness(selectedVideoState());
		expect(resizeVideoByDelta(ctx, -40, DEFAULT_VIDEO_CONFIG)).toBe(true);
		expect(getState().getBlock('v1' as BlockId)?.attrs?.widthPercent).toBe(60);
		// Clamp: repeatedly shrinking never goes below the configured minimum.
		resizeVideoByDelta(ctx, -100, DEFAULT_VIDEO_CONFIG);
		expect(getState().getBlock('v1' as BlockId)?.attrs?.widthPercent).toBe(
			DEFAULT_VIDEO_CONFIG.minWidthPercent,
		);
	});

	it('resets the width to the default', () => {
		const { ctx, getState } = harness(selectedVideoState({ ...VIDEO_ATTRS, widthPercent: 40 }));
		expect(resetVideoSize(ctx, DEFAULT_VIDEO_CONFIG)).toBe(true);
		expect(getState().getBlock('v1' as BlockId)?.attrs?.widthPercent).toBe(
			DEFAULT_VIDEO_CONFIG.defaultWidthPercent,
		);
	});

	it('applies a full edit and drops a stale hash when switching source', () => {
		const { ctx, getState } = harness(
			selectedVideoState({ ...VIDEO_ATTRS, provider: 'vimeo', videoId: '123', hash: 'old' }),
		);
		expect(
			applyVideoEdit(
				ctx,
				{ url: `https://youtu.be/${ID}`, title: 'New', caption: 'Cap', aspectRatio: '4 / 3' },
				DEFAULT_VIDEO_CONFIG,
			),
		).toBe(true);
		const attrs = getState().getBlock('v1' as BlockId)?.attrs;
		expect(attrs?.provider).toBe('youtube');
		expect(attrs?.videoId).toBe(ID);
		expect(attrs?.title).toBe('New');
		expect(attrs?.caption).toBe('Cap');
		expect(attrs?.hash).toBeUndefined();
	});
});

describe('removeVideo', () => {
	it('removes the selected video block', () => {
		const { ctx, getState } = harness(selectedVideoState());
		expect(removeVideo(ctx)).toBe(true);
		expect(getState().doc.children.some((b) => b.type === 'video')).toBe(false);
	});
});

describe('insertVideoReplacingRange', () => {
	it('replaces a sole-URL paragraph with the embed', () => {
		const url = `https://youtu.be/${ID}`;
		const state = stateBuilder()
			.paragraph(url, 'b1')
			.cursor('b1', url.length)
			.schema(['paragraph', 'video'], [])
			.build();
		const { ctx, getState } = harness(state);

		expect(
			insertVideoReplacingRange(
				ctx,
				{ blockId: 'b1' as BlockId, start: 0, end: url.length },
				VIDEO_ATTRS,
			),
		).toBe(true);
		const children = getState().doc.children;
		expect(children[0]?.type).toBe('video');
		expect(children.some((b) => getBlockText(b).includes('youtu.be'))).toBe(false);
	});
});
