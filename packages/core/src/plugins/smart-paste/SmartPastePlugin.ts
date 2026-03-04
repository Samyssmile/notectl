/**
 * SmartPastePlugin: detects structured content in clipboard text
 * and inserts it as formatted code blocks with syntax highlighting.
 */

import { insertBlockAfterAnchor, resolveAnchorBlockId } from '../../commands/BlockInsertion.js';
import { addDeleteSelectionSteps } from '../../commands/Commands.js';
import {
	type BlockNode,
	createBlockNode,
	createTextNode,
	generateBlockId,
} from '../../model/Document.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PasteInterceptor, Plugin, PluginContext } from '../Plugin.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import {
	SMART_PASTE_LOCALE_EN,
	type SmartPasteLocale,
	loadSmartPasteLocale,
} from './SmartPasteLocale.js';
import type { ContentDetector, DetectionResult, SmartPasteConfig } from './SmartPasteTypes.js';
import { SMART_PASTE_SERVICE_KEY } from './SmartPasteTypes.js';
import { JsonDetector } from './detectors/JsonDetector.js';
import { XmlDetector } from './detectors/XmlDetector.js';

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

		// Register built-in detectors
		this.detectors.push(new JsonDetector());
		this.detectors.push(new XmlDetector());

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
		// Don't create nested code blocks
		if (this.isCursorInCodeBlock(state)) return null;

		// Run all detectors and pick the highest confidence result
		const detection: DetectionResult | null = this.detectContent(plainText);
		if (!detection) return null;

		const tr: Transaction | null = this.buildCodeBlockTransaction(state, detection);
		if (tr && this.context) {
			this.context.announce(this.locale.detectedAsCodeBlock(detection.language));
		}
		return tr;
	};

	private detectContent(text: string): DetectionResult | null {
		let best: DetectionResult | null = null;

		for (const detector of this.detectors) {
			const result: DetectionResult | null = detector.detect(text);
			if (result && (best === null || result.confidence > best.confidence)) {
				best = result;
			}
		}

		return best;
	}

	private isCursorInCodeBlock(state: EditorState): boolean {
		const sel = state.selection;
		if (!isTextSelection(sel)) return false;

		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		return block?.type === 'code_block';
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
}
