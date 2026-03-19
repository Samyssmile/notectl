/**
 * SmartPastePlugin: detects structured content in clipboard text
 * and inserts it as formatted code blocks with syntax highlighting.
 * Mixed content (text + code) is split into separate blocks.
 */

import {
	type InsertionContext,
	findTableCellAncestor,
	insertBlockAfterAnchor,
	resolveAnchorBlockId,
	resolveCellInsertionContext,
	resolveRootInsertionContext,
} from '../../commands/BlockInsertion.js';
import { addDeleteSelectionSteps } from '../../commands/Commands.js';
import {
	type BlockNode,
	createBlockNode,
	createTextNode,
	generateBlockId,
} from '../../model/Document.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isTextSelection,
} from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PasteInterceptor, Plugin, PluginContext } from '../Plugin.js';
import { LANGUAGE_REGISTRY_SERVICE_KEY } from '../language/LanguageTypes.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { splitAndClassify } from './ContentSplitter.js';
import {
	SMART_PASTE_LOCALE_EN,
	type SmartPasteLocale,
	loadSmartPasteLocale,
} from './SmartPasteLocale.js';
import type {
	ContentDetector,
	DetectionResult,
	PasteSegment,
	SmartPasteConfig,
} from './SmartPasteTypes.js';
import { SMART_PASTE_SERVICE_KEY } from './SmartPasteTypes.js';

export class SmartPastePlugin implements Plugin {
	readonly id = 'smart-paste';
	readonly name = 'Smart Paste';
	readonly dependencies = ['code-block'] as const;

	private readonly config: SmartPasteConfig;
	private readonly detectors: ContentDetector[] = [];
	private context: PluginContext | null = null;
	private locale: SmartPasteLocale = SMART_PASTE_LOCALE_EN;

	constructor(config?: Partial<SmartPasteConfig>) {
		this.config = { ...config };
	}

	async init(context: PluginContext): Promise<void> {
		this.context = context;

		this.locale = await resolveLocale(
			context,
			this.config.locale,
			SMART_PASTE_LOCALE_EN,
			loadSmartPasteLocale,
		);

		// Subscribe to language registry for detectors (replay provides built-ins)
		const registry = context.getService(LANGUAGE_REGISTRY_SERVICE_KEY);
		if (registry) {
			registry.onRegister((support) => {
				if (support.detection) {
					this.detectors.push(support.detection);
				}
			});
		}

		// Register config-provided detectors
		if (this.config.detectors) {
			for (const detector of this.config.detectors) {
				this.detectors.push(detector);
			}
		}

		// Register paste interceptor
		context.registerPasteInterceptor(this.handlePaste, { name: 'smart-paste', priority: 50 });

		// Register service for external detector registration
		context.registerService(SMART_PASTE_SERVICE_KEY, {
			registerDetector: (detector: ContentDetector) => {
				this.detectors.push(detector);
			},
		});
	}

	destroy(): void {
		this.context = null;
		this.detectors.length = 0;
	}

	// --- Paste Interceptor ---

	private readonly handlePaste: PasteInterceptor = (
		plainText: string,
		_html: string,
		state: EditorState,
	): Transaction | null => {
		if (this.isCursorInCodeBlock(state)) return null;

		const segments: readonly PasteSegment[] | null = splitAndClassify(plainText, this.detectors);
		if (!segments) return null;

		// Single code-only segment: use existing fast path
		if (segments.length === 1 && segments[0]?.detection) {
			return this.handleSingleCodeBlock(state, segments[0].detection);
		}

		// Mixed content: create multiple blocks
		return this.handleMixedContent(state, segments);
	};

	private isCursorInCodeBlock(state: EditorState): boolean {
		const sel = state.selection;
		if (!isTextSelection(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		return block?.type === 'code_block';
	}

	// --- Single Code Block (existing behavior) ---

	private handleSingleCodeBlock(
		state: EditorState,
		detection: DetectionResult,
	): Transaction | null {
		const tr: Transaction | null = this.buildCodeBlockTransaction(state, detection);
		if (tr && this.context) {
			this.context.announce(this.locale.detectedAsCodeBlock(detection.language));
		}
		return tr;
	}

	private buildCodeBlockTransaction(
		state: EditorState,
		detection: DetectionResult,
	): Transaction | null {
		const sel = state.selection;
		const builder = state.transaction('paste');

		// Delete selection if range-selected
		let anchorBlockId: BlockId;
		if (isTextSelection(sel) && !isCollapsed(sel)) {
			const landingId: BlockId | undefined = addDeleteSelectionSteps(state, builder);
			anchorBlockId = landingId ?? sel.anchor.blockId;
		} else {
			anchorBlockId = resolveAnchorBlockId(sel);
		}

		// Create the code block node
		const newBlockId: BlockId = generateBlockId();
		const codeBlock: BlockNode = createBlockNode(
			nodeType('code_block') as NodeTypeName,
			[createTextNode(detection.formattedText)],
			newBlockId,
			{ language: detection.language, backgroundColor: '' },
		);

		// Insert at cursor (handles cell vs root, empty anchor removal)
		const inserted: boolean = insertBlockAfterAnchor(
			state,
			builder,
			anchorBlockId,
			codeBlock,
			sel,
			this.context?.getSchemaRegistry(),
		);
		if (!inserted) return null;

		builder.setSelection(createCollapsedSelection(newBlockId, detection.formattedText.length));

		return builder.build();
	}

	// --- Mixed Content (multiple blocks) ---

	private handleMixedContent(
		state: EditorState,
		segments: readonly PasteSegment[],
	): Transaction | null {
		const tr: Transaction | null = this.buildMultiBlockTransaction(state, segments);
		if (tr && this.context) {
			this.announceMixedContent(segments);
		}
		return tr;
	}

	private buildMultiBlockTransaction(
		state: EditorState,
		segments: readonly PasteSegment[],
	): Transaction | null {
		const sel = state.selection;
		const builder = state.transaction('paste');

		let anchorBlockId: BlockId;
		if (isTextSelection(sel) && !isCollapsed(sel)) {
			const landingId: BlockId | undefined = addDeleteSelectionSteps(state, builder);
			anchorBlockId = landingId ?? sel.anchor.blockId;
		} else {
			anchorBlockId = resolveAnchorBlockId(sel);
		}

		const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);
		const schemaRegistry = this.context?.getSchemaRegistry();

		const ctx: InsertionContext | undefined = cellId
			? resolveCellInsertionContext(state, anchorBlockId, cellId, schemaRegistry)
			: resolveRootInsertionContext(state, anchorBlockId, schemaRegistry);
		if (!ctx) return null;

		const insertOffset: number = !cellId && isGapCursor(sel) && sel.side === 'before' ? 0 : 1;
		let insertIndex: number = ctx.anchorIndex + insertOffset;
		let lastBlockId: BlockId | undefined;
		let lastBlockTextLen = 0;

		for (const segment of segments) {
			const block: BlockNode = segment.detection
				? this.createCodeBlockNode(segment.detection)
				: this.createParagraphNode(segment.text);

			builder.insertNode(ctx.parentPath, insertIndex, block);
			insertIndex++;
			lastBlockId = block.id;
			lastBlockTextLen = segment.detection
				? segment.detection.formattedText.length
				: segment.text.length;
		}

		const shouldRemoveAnchor: boolean = cellId
			? ctx.isAnchorEmpty && ctx.anchorIndex >= 0
			: ctx.isAnchorEmpty && !isGapCursor(sel);

		if (shouldRemoveAnchor) {
			builder.removeNode(ctx.parentPath, ctx.anchorIndex);
		}

		if (lastBlockId) {
			builder.setSelection(createCollapsedSelection(lastBlockId, lastBlockTextLen));
		}

		return builder.build();
	}

	private createCodeBlockNode(detection: DetectionResult): BlockNode {
		return createBlockNode(
			nodeType('code_block') as NodeTypeName,
			[createTextNode(detection.formattedText)],
			generateBlockId(),
			{ language: detection.language, backgroundColor: '' },
		);
	}

	private createParagraphNode(text: string): BlockNode {
		return createBlockNode(
			nodeType('paragraph') as NodeTypeName,
			[createTextNode(text)],
			generateBlockId(),
		);
	}

	private announceMixedContent(segments: readonly PasteSegment[]): void {
		let textCount = 0;
		let codeCount = 0;
		const languages: string[] = [];

		for (const segment of segments) {
			if (segment.detection) {
				codeCount++;
				if (!languages.includes(segment.detection.language)) {
					languages.push(segment.detection.language);
				}
			} else {
				textCount++;
			}
		}

		this.context?.announce(this.locale.detectedMixedContent(textCount, codeCount, languages));
	}
}
