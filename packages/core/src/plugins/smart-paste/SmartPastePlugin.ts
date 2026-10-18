/**
 * SmartPastePlugin: detects structured content in clipboard text
 * and inserts it as formatted code blocks with syntax highlighting.
 * Mixed content (text + code) is split into separate blocks.
 */

import { insertBlocksAfterAnchor } from '../../commands/BlockInsertion.js';
import {
	type ReplacementTarget,
	getReceivingBlock,
	resolveReplacementTarget,
} from '../../commands/SelectionReplacement.js';
import {
	type BlockNode,
	createBlockNode,
	createTextNode,
	generateBlockId,
	getBlockLength,
} from '../../model/Document.js';
import { type EditorSelection, createCollapsedSelection } from '../../model/Selection.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction, TransactionBuilder } from '../../state/Transaction.js';
import type { PasteInterceptor, Plugin, PluginContext } from '../Plugin.js';
import { LANGUAGE_REGISTRY_SERVICE_KEY } from '../language/LanguageTypes.js';
import {
	JAVA_SUPPORT,
	JSON_SUPPORT,
	TYPESCRIPT_SUPPORT,
	XML_SUPPORT,
} from '../language/bundles/index.js';
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

const BUILTIN_LANGUAGE_SUPPORTS = [
	JAVA_SUPPORT,
	JSON_SUPPORT,
	TYPESCRIPT_SUPPORT,
	XML_SUPPORT,
] as const;

/** A paste whose selection deletion is already recorded in `builder`. */
interface ReplacementPaste {
	readonly builder: TransactionBuilder;
	readonly target: ReplacementTarget;
	readonly selection: EditorSelection;
}

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

		// Detection belongs to Smart Paste, while Code Block contributes only
		// highlighting. Preserve those existing capabilities when adding detectors.
		const registry = context.getService(LANGUAGE_REGISTRY_SERVICE_KEY);
		if (registry) {
			for (const support of BUILTIN_LANGUAGE_SUPPORTS) {
				const existing = registry.get(support.id);
				registry.register(existing ? { ...existing, detection: support.detection } : support);
			}
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
		const segments: readonly PasteSegment[] | null = splitAndClassify(plainText, this.detectors);
		if (!segments) return null;

		// Text that lands in a code block is pasted literally by the code block.
		const builder: TransactionBuilder = state.transaction('paste');
		const target: ReplacementTarget = resolveReplacementTarget(state, builder);
		if (getReceivingBlock(target)?.type === 'code_block') return null;

		const paste: ReplacementPaste = { builder, target, selection: state.selection };

		// Single code-only segment: use existing fast path
		if (segments.length === 1 && segments[0]?.detection) {
			return this.handleSingleCodeBlock(paste, segments[0].detection);
		}

		// Mixed content: create multiple blocks
		return this.handleMixedContent(paste, segments);
	};

	// --- Single Code Block (existing behavior) ---

	private handleSingleCodeBlock(
		paste: ReplacementPaste,
		detection: DetectionResult,
	): Transaction | null {
		const tr: Transaction | null = this.buildCodeBlockTransaction(paste, detection);
		if (tr && this.context) {
			this.context.announce(this.locale.detectedAsCodeBlock(detection.language));
		}
		return tr;
	}

	private buildCodeBlockTransaction(
		paste: ReplacementPaste,
		detection: DetectionResult,
	): Transaction | null {
		const { builder, target, selection } = paste;

		// Create the code block node
		const codeBlock: BlockNode = this.createCodeBlockNode(detection);

		// Insert at cursor (actual parent or root escape, empty anchor removal)
		if (
			!insertBlocksAfterAnchor(
				target.state,
				builder,
				target.blockId,
				[codeBlock],
				selection,
				this.context?.getSchemaRegistry(),
			)
		) {
			return null;
		}

		builder.setSelection(createCollapsedSelection(codeBlock.id, detection.formattedText.length));

		return builder.build();
	}

	// --- Mixed Content (multiple blocks) ---

	private handleMixedContent(
		paste: ReplacementPaste,
		segments: readonly PasteSegment[],
	): Transaction | null {
		const tr: Transaction | null = this.buildMultiBlockTransaction(paste, segments);
		if (tr && this.context) {
			this.announceMixedContent(segments);
		}
		return tr;
	}

	private buildMultiBlockTransaction(
		paste: ReplacementPaste,
		segments: readonly PasteSegment[],
	): Transaction | null {
		const { builder, selection } = paste;
		const { state: working, blockId: anchorBlockId } = paste.target;
		const blocks: readonly BlockNode[] = segments.map((segment) =>
			segment.detection
				? this.createCodeBlockNode(segment.detection)
				: this.createParagraphNode(segment.text),
		);
		if (
			!insertBlocksAfterAnchor(
				working,
				builder,
				anchorBlockId,
				blocks,
				selection,
				this.context?.getSchemaRegistry(),
			)
		) {
			return null;
		}

		const lastBlock = blocks[blocks.length - 1];
		if (lastBlock) {
			builder.setSelection(createCollapsedSelection(lastBlock.id, getBlockLength(lastBlock)));
		}

		return builder.build();
	}

	private createCodeBlockNode(detection: DetectionResult): BlockNode {
		return createBlockNode(
			nodeType('code_block'),
			[createTextNode(detection.formattedText)],
			generateBlockId(),
			{ language: detection.language, backgroundColor: '' },
		);
	}

	private createParagraphNode(text: string): BlockNode {
		return createBlockNode(nodeType('paragraph'), [createTextNode(text)], generateBlockId());
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
