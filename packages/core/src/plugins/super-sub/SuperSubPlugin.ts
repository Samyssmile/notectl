/**
 * SuperSubPlugin: registers superscript and subscript inline marks with
 * MarkSpecs, toggle commands, keyboard shortcuts, toolbar buttons, and
 * a middleware that enforces mutual exclusivity between the two marks.
 *
 * Data-driven — each mark type is defined declaratively and all
 * registrations are derived from the same definition table.
 */

import { isMarkActive, toggleMark } from '../../commands/Commands.js';
import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import type { Mark } from '../../model/Document.js';
import type { ParseRule } from '../../model/ParseRule.js';
import type { SanitizeConfig } from '../../model/SanitizeConfig.js';
import { markType as mkType } from '../../model/TypeBrands.js';
import type { RemoveMarkStep, Step } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';
import { SUPER_SUB_LOCALES, type SuperSubLocale } from './SuperSubLocale.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		superscript: Record<string, never>;
		subscript: Record<string, never>;
	}
}

// --- Configuration ---

/** Controls toolbar button visibility per mark. */
export interface SuperSubToolbarConfig {
	readonly superscript?: boolean;
	readonly subscript?: boolean;
}

/** Controls which marks are enabled and which toolbar buttons are shown. */
export interface SuperSubConfig {
	readonly superscript: boolean;
	readonly subscript: boolean;
	readonly toolbar?: SuperSubToolbarConfig;
	/** When true, a separator is rendered after the last toolbar item. */
	readonly separatorAfter?: boolean;
	readonly locale?: SuperSubLocale;
}

const DEFAULT_CONFIG: SuperSubConfig = {
	superscript: true,
	subscript: true,
};

// --- Mark Definitions ---

interface MarkDefinition {
	readonly type: 'superscript' | 'subscript';
	readonly opposite: 'superscript' | 'subscript';
	readonly configKey: keyof Omit<SuperSubConfig, 'toolbar' | 'separatorAfter' | 'locale'>;
	readonly rank: number;
	readonly tag: string;
	readonly label: string;
	readonly icon: string;
	readonly keyBinding: string;
	readonly toolbarPriority: number;
	readonly toHTMLString: (content: string) => string;
	readonly parseHTML: readonly ParseRule[];
	readonly sanitize: SanitizeConfig;
}

const SUPERSCRIPT_ICON: string = [
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
	'<path d="M16 7.41L11.41 12 16 16.59 14.59 18l-6-6 6-6z"',
	' fill="none"/>',
	'<path d="M9.64 7.64c.23-.5.36-1.05.36-1.64',
	' 0-2.21-1.79-4-4-4H2v14h4.36c2.34 0 4.24-1.9',
	' 4.24-4.24 0-1.6-.89-2.99-2.2-3.71zM4.5 4.5H6c.83',
	' 0 1.5.67 1.5 1.5S6.83 7.5 6 7.5H4.5v-3zm2 9H4.5v-3H6.5c.83',
	' 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" fill="none"/>',
	'<path d="M15.97 3.84c0-.47.19-.91.53-1.21.34-.31.8-.49',
	' 1.3-.49.5 0 .95.18 1.28.48.32.3.5.7.51 1.15h1.59c-.02',
	'-.96-.43-1.83-1.13-2.42C19.36.77 18.45.44 17.5.44c-.88',
	' 0-1.74.28-2.39.8-.67.53-1.06 1.28-1.06 2.1 0 .76.34',
	' 1.47.93 1.97.59.49 1.41.84 2.32 1.15.7.24 1.26.5 1.62.8.35.3.53.64.53',
	' 1.02 0 .48-.2.93-.55 1.24-.36.3-.84.48-1.37.48-.55 0-1.04-.2-1.39-.54',
	'-.34-.33-.53-.8-.53-1.32h-1.58c.01 1.02.43 1.95 1.16 2.57.72.62 1.67.96',
	' 2.67.96.92 0 1.81-.3 2.46-.84.67-.56 1.04-1.33 1.04-2.18 0-.81-.36-1.56',
	'-.99-2.08-.62-.51-1.48-.88-2.43-1.2-.67-.23-1.2-.47-1.52-.75-.32-.27-.46',
	'-.59-.46-.94z"/>',
	'<path d="M5.88 20h2.66l3.4-5.42L15.3 20h2.67l-4.73-7.38',
	' 4.37-6.62h-2.6l-3.07 4.98L8.92 6h-2.6l4.26 6.58z"/>',
	'</svg>',
].join('');

const SUBSCRIPT_ICON: string = [
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
	'<path d="M15.97 16.84c0-.47.19-.91.53-1.21.34-.31.8-.49',
	' 1.3-.49.5 0 .95.18 1.28.48.32.3.5.7.51 1.15h1.59c-.02',
	'-.96-.43-1.83-1.13-2.42-.7-.58-1.61-.91-2.56-.91-.88',
	' 0-1.74.28-2.39.8-.67.53-1.06 1.28-1.06 2.1 0 .76.34',
	' 1.47.93 1.97.59.49 1.41.84 2.32 1.15.7.24 1.26.5 1.62.8.35.3.53.64.53',
	' 1.02 0 .48-.2.93-.55 1.24-.36.3-.84.48-1.37.48-.55 0-1.04-.2-1.39-.54',
	'-.34-.33-.53-.8-.53-1.32h-1.58c.01 1.02.43 1.95 1.16 2.57.72.62 1.67.96',
	' 2.67.96.92 0 1.81-.3 2.46-.84.67-.56 1.04-1.33 1.04-2.18 0-.81-.36-1.56',
	'-.99-2.08-.62-.51-1.48-.88-2.43-1.2-.67-.23-1.2-.47-1.52-.75-.32-.27-.46',
	'-.59-.46-.94z"/>',
	'<path d="M5.88 18h2.66l3.4-5.42L15.3 18h2.67l-4.73-7.38',
	' 4.37-6.62h-2.6l-3.07 4.98L8.92 4h-2.6l4.26 6.58z"/>',
	'</svg>',
].join('');

const MARK_DEFINITIONS: readonly MarkDefinition[] = [
	{
		type: 'superscript',
		opposite: 'subscript',
		configKey: 'superscript',
		rank: 4,
		tag: 'sup',
		label: 'Superscript',
		icon: SUPERSCRIPT_ICON,
		keyBinding: 'Mod-.',
		toolbarPriority: 50,
		toHTMLString: (content) => `<sup>${content}</sup>`,
		parseHTML: [{ tag: 'sup' }],
		sanitize: { tags: ['sup'] },
	},
	{
		type: 'subscript',
		opposite: 'superscript',
		configKey: 'subscript',
		rank: 4,
		tag: 'sub',
		label: 'Subscript',
		icon: SUBSCRIPT_ICON,
		keyBinding: 'Mod-,',
		toolbarPriority: 51,
		toHTMLString: (content) => `<sub>${content}</sub>`,
		parseHTML: [{ tag: 'sub' }],
		sanitize: { tags: ['sub'] },
	},
];

// --- Plugin ---

export class SuperSubPlugin implements Plugin {
	readonly id = 'super-sub';
	readonly name = 'Superscript & Subscript';
	readonly priority = 23;

	private readonly config: SuperSubConfig;
	private locale!: SuperSubLocale;

	constructor(config?: Partial<SuperSubConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(SUPER_SUB_LOCALES, context, this.config.locale);

		const enabledMarks: MarkDefinition[] = MARK_DEFINITIONS.filter(
			(def) => this.config[def.configKey],
		);

		const visibleToolbarMarks: MarkDefinition[] = enabledMarks.filter((def) =>
			this.isToolbarVisible(def.configKey),
		);
		const lastVisibleMark: MarkDefinition | undefined = visibleToolbarMarks.at(-1);

		for (const def of enabledMarks) {
			const isSeparatorTarget: boolean = !!this.config.separatorAfter && def === lastVisibleMark;
			this.registerMark(context, def, isSeparatorTarget);
		}

		this.registerKeymaps(context, enabledMarks);
		this.registerExclusivityMiddleware(context, enabledMarks);
		this.registerDisabledToolbarItems(context);
	}

	private registerMark(context: PluginContext, def: MarkDefinition, separatorAfter: boolean): void {
		const commandName: string = toCommandName(def.type);
		const toolbarVisible: boolean = this.isToolbarVisible(def.configKey);

		context.registerMarkSpec({
			type: def.type,
			rank: def.rank,
			toDOM() {
				return document.createElement(def.tag);
			},
			toHTMLString: (_mark, content) => def.toHTMLString(content),
			parseHTML: def.parseHTML,
			sanitize: def.sanitize,
		});

		context.registerCommand(commandName, () => {
			const tr = toggleMark(context.getState(), mkType(def.type));
			if (tr) {
				context.dispatch(tr);
				return true;
			}
			return false;
		});

		if (toolbarVisible) {
			const label: string =
				def.type === 'superscript' ? this.locale.superscriptLabel : this.locale.subscriptLabel;
			const tooltip: string =
				def.type === 'superscript'
					? this.locale.superscriptTooltip(formatShortcut(def.keyBinding))
					: this.locale.subscriptTooltip(formatShortcut(def.keyBinding));
			context.registerToolbarItem({
				id: def.type,
				group: 'format',
				icon: def.icon,
				label,
				tooltip,
				command: commandName,
				priority: def.toolbarPriority,
				separatorAfter,
				isActive: (state) => isMarkActive(state, mkType(def.type)),
			});
		}
	}

	private registerKeymaps(context: PluginContext, marks: readonly MarkDefinition[]): void {
		const keymap: Record<string, () => boolean> = {};
		for (const def of marks) {
			const commandName: string = toCommandName(def.type);
			keymap[def.keyBinding] = () => context.executeCommand(commandName);
		}
		if (Object.keys(keymap).length > 0) {
			context.registerKeymap(keymap);
		}
	}

	/**
	 * Ensures superscript and subscript are mutually exclusive.
	 * When an addMark step for one type is found, a removeMark step
	 * for the opposite type is injected. For stored marks, the opposite
	 * mark is filtered out.
	 */
	private registerExclusivityMiddleware(
		context: PluginContext,
		enabledMarks: readonly MarkDefinition[],
	): void {
		const bothEnabled: boolean =
			enabledMarks.some((d) => d.type === 'superscript') &&
			enabledMarks.some((d) => d.type === 'subscript');

		if (!bothEnabled) return;

		context.registerMiddleware((tr, _state, next) => {
			let patched = false;

			// Handle addMark steps: inject removeMark for the opposite type
			const patchedSteps: Step[] = [];
			for (const step of tr.steps) {
				if (step.type !== 'addMark') {
					patchedSteps.push(step);
					continue;
				}

				const markName: string = step.mark.type;
				const def: MarkDefinition | undefined = MARK_DEFINITIONS.find((d) => d.type === markName);
				if (!def) {
					patchedSteps.push(step);
					continue;
				}

				patched = true;
				const removeStep: RemoveMarkStep = {
					type: 'removeMark',
					blockId: step.blockId,
					from: step.from,
					to: step.to,
					mark: { type: mkType(def.opposite) },
					...(step.path ? { path: step.path } : {}),
				};
				patchedSteps.push(removeStep, step);
			}

			// Handle stored marks: remove the opposite mark
			let storedMarksAfter: readonly Mark[] | null = tr.storedMarksAfter;
			if (storedMarksAfter) {
				const hasSup: boolean = storedMarksAfter.some((m) => m.type === 'superscript');
				const hasSub: boolean = storedMarksAfter.some((m) => m.type === 'subscript');

				if (hasSup && hasSub) {
					// Keep the one that was most recently added (last in array)
					const lastSupIdx: number = storedMarksAfter.findLastIndex(
						(m) => m.type === 'superscript',
					);
					const lastSubIdx: number = storedMarksAfter.findLastIndex((m) => m.type === 'subscript');
					const removeType: string = lastSupIdx > lastSubIdx ? 'subscript' : 'superscript';

					storedMarksAfter = storedMarksAfter.filter((m) => m.type !== removeType);
					patched = true;
				}
			}

			next(patched ? { ...tr, steps: patchedSteps, storedMarksAfter } : tr);
		});
	}

	/**
	 * Registers disabled toolbar buttons for marks whose feature is disabled
	 * but whose toolbar button is explicitly requested.
	 */
	private registerDisabledToolbarItems(context: PluginContext): void {
		if (!this.config.toolbar) return;

		for (const def of MARK_DEFINITIONS) {
			const featureEnabled: boolean = this.config[def.configKey];
			const toolbarVisible: boolean = this.config.toolbar[def.configKey] ?? true;

			if (!featureEnabled && toolbarVisible) {
				const label: string =
					def.type === 'superscript' ? this.locale.superscriptLabel : this.locale.subscriptLabel;
				context.registerToolbarItem({
					id: def.type,
					group: 'format',
					icon: def.icon,
					label,
					command: toCommandName(def.type),
					priority: def.toolbarPriority,
					isEnabled: () => false,
				});
			}
		}
	}

	private isToolbarVisible(
		configKey: keyof Omit<SuperSubConfig, 'toolbar' | 'separatorAfter' | 'locale'>,
	): boolean {
		if (!this.config.toolbar) return true;
		return this.config.toolbar[configKey] ?? true;
	}
}

/** Converts a mark type to its toggle command name (e.g. 'superscript' → 'toggleSuperscript'). */
function toCommandName(markType: string): string {
	return `toggle${markType.charAt(0).toUpperCase()}${markType.slice(1)}`;
}
