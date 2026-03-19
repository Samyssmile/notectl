/**
 * Orchestrates editor initialization: theme, DOM, plugins, view, and input setup.
 *
 * Extracted from NotectlEditor to keep the Web Component shell thin.
 * All wiring logic lives here; the editor stores the returned components.
 */

import { DecorationSet } from '../decorations/Decoration.js';
import { LocaleService, LocaleServiceKey } from '../i18n/LocaleService.js';
import { InputManager } from '../input/InputManager.js';
import type { Document } from '../model/Document.js';
import { schemaFromRegistry } from '../model/Schema.js';
import { selectionsEqual } from '../model/Selection.js';
import { getTextDirection } from '../platform/Platform.js';
import type { Plugin } from '../plugins/Plugin.js';
import { PluginManager } from '../plugins/PluginManager.js';
import { BEFORE_PRINT } from '../plugins/print/PrintTypes.js';
import { EditorState } from '../state/EditorState.js';
import { isAllowedInReadonly } from '../state/ReadonlyGuard.js';
import type { Transaction } from '../state/Transaction.js';
import { navigateFromGapCursor } from '../view/CaretNavigation.js';
import { EditorView } from '../view/EditorView.js';
import { buildAnnouncement } from './Announcer.js';
import { registerBuiltinSpecs } from './BuiltinSpecs.js';
import { isEditorEmpty } from './ContentSerializer.js';
import type { NotectlEditorConfig } from './EditorConfig.js';
import type { EditorConfigController } from './EditorConfigController.js';
import { type EditorDOMElements, createEditorDOM } from './EditorDOM.js';
import type { EditorEventEmitter } from './EditorEventEmitter.js';
import { EDITOR_LOCALE_EN, type EditorLocale, loadEditorLocale } from './EditorLocale.js';
import type { EditorStyleCoordinator } from './EditorStyleCoordinator.js';
import { EditorThemeController } from './EditorThemeController.js';
import { PaperLayoutController } from './PaperLayoutController.js';
import { ensureEssentialPlugins, processToolbarConfig } from './PluginBootstrapper.js';
import { ThemePreset } from './theme/ThemeTokens.js';

/** Dependencies provided by the NotectlEditor host element. */
export interface InitializerDeps {
	readonly shadow: ShadowRoot;
	readonly config: NotectlEditorConfig;
	/** Resolved dir from the host element's attribute (fallback when config.dir is unset). */
	readonly hostDir: 'ltr' | 'rtl' | undefined;
	readonly configController: EditorConfigController;
	readonly styleCoordinator: EditorStyleCoordinator;
	readonly events: EditorEventEmitter;
	readonly preInitPlugins: readonly Plugin[];
	isCancelled?(): boolean;
}

/** Components created during initialization, returned to the editor for storage. */
export interface InitResult {
	readonly view: EditorView;
	readonly inputManager: InputManager;
	readonly pluginManager: PluginManager;
	readonly domElements: EditorDOMElements;
	readonly themeController: EditorThemeController;
	readonly paperLayout: PaperLayoutController | null;
	/** Nulls closure-captured references to prevent stale dispatches after destroy. */
	readonly release: () => void;
}

/** Performs the full editor initialization sequence. Returns null if setup fails. */
export async function initializeEditor(deps: InitializerDeps): Promise<InitResult | null> {
	const session: EditorInitSession = new EditorInitSession(deps);
	return session.run();
}

// --- Internal init session -----------------------------------------------

/**
 * Encapsulates the mutable state and phases of editor initialization.
 *
 * Each phase method is independently readable and focused on a single concern.
 * The class exists to share mutable view/pluginManager references between
 * dispatch, cleanup, and the plugin onBeforeReady callback.
 */
class EditorInitSession {
	private readonly cfg: NotectlEditorConfig;
	private themeController: EditorThemeController | null = null;
	private domElements: EditorDOMElements | null = null;
	private paperLayout: PaperLayoutController | null = null;
	private pluginManager: PluginManager | null = null;
	private inputManager: InputManager | null = null;
	private view: EditorView | null = null;
	private cleanedUp = false;

	constructor(private readonly deps: InitializerDeps) {
		this.cfg = deps.config;
	}

	/** Orchestrates the full initialization sequence. */
	async run(): Promise<InitResult | null> {
		try {
			this.setupTheme();
			if (this.isCancelled()) return this.abort();

			const locale: EditorLocale = await resolveLocale(this.cfg);
			if (this.isCancelled()) return this.abort();

			this.setupDOM(locale);
			this.setupPlugins();
			await this.initPluginsAndView();

			if (
				this.isCancelled() ||
				!this.view ||
				!this.inputManager ||
				!this.pluginManager ||
				!this.domElements ||
				!this.themeController
			) {
				return this.abort();
			}

			const view: EditorView = this.view;
			const inputManager: InputManager = this.inputManager;
			const pluginManager: PluginManager = this.pluginManager;
			const domElements: EditorDOMElements = this.domElements;
			const themeController: EditorThemeController = this.themeController;

			this.finalizeSetup(pluginManager, domElements);

			return {
				view,
				inputManager,
				pluginManager,
				domElements,
				themeController,
				paperLayout: this.paperLayout,
				release: (): void => {
					this.view = null;
				},
			};
		} catch (error) {
			await this.cleanup();
			throw error;
		}
	}

	private setupTheme(): void {
		this.themeController = new EditorThemeController(this.deps.shadow);
		this.deps.styleCoordinator.setup(this.deps.shadow, this.cfg.styleNonce, this.themeController);
		this.themeController.apply(this.cfg.theme ?? ThemePreset.Light);
	}

	private setupDOM(locale: EditorLocale): void {
		this.domElements = createEditorDOM({
			readonly: this.cfg.readonly,
			placeholder: this.cfg.placeholder,
			dir: this.cfg.dir ?? this.deps.hostDir,
			locale,
		});
		this.deps.shadow.appendChild(this.domElements.wrapper);

		if (this.cfg.paperSize) {
			this.paperLayout = new PaperLayoutController(
				this.domElements.wrapper,
				this.domElements.content,
			);
			this.paperLayout.apply(this.cfg.paperSize);
		}
	}

	private setupPlugins(): void {
		if (!this.domElements) return;

		this.pluginManager = new PluginManager();
		this.pluginManager.registerService(
			LocaleServiceKey,
			new LocaleService(this.cfg.locale ?? 'browser'),
		);
		registerBuiltinSpecs(this.pluginManager.schemaRegistry);
		processToolbarConfig(this.pluginManager, this.cfg.toolbar);

		for (const plugin of this.cfg.plugins ?? []) {
			this.pluginManager.register(plugin);
		}
		for (const plugin of this.deps.preInitPlugins) {
			this.pluginManager.register(plugin);
		}
		ensureEssentialPlugins(this.pluginManager, this.cfg.features);

		this.domElements.content.addEventListener('focus', () =>
			this.deps.events.emit('focus', undefined),
		);
		this.domElements.content.addEventListener('blur', () =>
			this.deps.events.emit('blur', undefined),
		);
	}

	private async initPluginsAndView(): Promise<void> {
		if (!this.pluginManager || !this.domElements || !this.themeController) {
			return;
		}

		const dom: EditorDOMElements = this.domElements;
		const pm: PluginManager = this.pluginManager;
		const tc: EditorThemeController = this.themeController;

		await pm.init({
			isCancelled: () => this.isCancelled(),
			getState: () => {
				if (!this.view) throw new Error('View not initialized');
				return this.view.getState();
			},
			dispatch: (tr: Transaction) => this.dispatch(tr),
			getContainer: () => dom.content,
			getPluginContainer: (position) =>
				position === 'top' ? dom.topPluginContainer : dom.bottomPluginContainer,
			announce: (text: string) => {
				if (dom.announcer) dom.announcer.textContent = text;
			},
			hasAnnouncement: () => !!dom.announcer?.textContent,
			onBeforeReady: () => this.createInputAndView(dom, pm, tc),
		});
	}

	/** Creates InputManager and EditorView. Called synchronously by PluginManager. */
	private createInputAndView(
		dom: EditorDOMElements,
		pm: PluginManager,
		tc: EditorThemeController,
	): void {
		if (this.isCancelled() || !this.pluginManager || !this.themeController) {
			return;
		}

		const schema = schemaFromRegistry(pm.schemaRegistry);
		const state: EditorState = EditorState.create({ schema });

		this.inputManager = new InputManager(dom.content, {
			getState: () => {
				if (!this.view) throw new Error('View not initialized');
				return this.view.getState();
			},
			dispatch: (tr: Transaction) => this.dispatch(tr),
			syncSelection: () => this.view?.syncSelection(),
			undo: () => this.view?.undo(),
			redo: () => this.view?.redo(),
			schemaRegistry: pm.schemaRegistry,
			keymapRegistry: pm.keymapRegistry,
			inputRuleRegistry: pm.inputRuleRegistry,
			fileHandlerRegistry: pm.fileHandlerRegistry,
			isReadOnly: () => this.deps.configController.isReadOnly,
			getPasteInterceptors: () => pm.getPasteInterceptors(),
			getTextDirection,
			navigateFromGapCursor,
		});

		this.view = new EditorView(dom.content, {
			state,
			schemaRegistry: pm.schemaRegistry,
			keymapRegistry: pm.keymapRegistry,
			fileHandlerRegistry: pm.fileHandlerRegistry,
			nodeViewRegistry: pm.nodeViewRegistry,
			maxHistoryDepth: this.cfg.maxHistoryDepth,
			getDecorations: (s, tr) => pm.collectDecorations(s, tr) ?? DecorationSet.empty,
			onStateChange: (oldState, newState, tr) => {
				handleStateChange(oldState, newState, tr, dom, pm, this.deps.events);
			},
			isReadOnly: () => this.deps.configController.isReadOnly,
			compositionState: this.inputManager.compositionTracker,
		});

		updateEmptyState(dom.content, this.view.getState().doc);

		const pluginSheets: readonly CSSStyleSheet[] = pm.getPluginStyleSheets();
		if (pluginSheets.length > 0) {
			tc.setPluginStyleSheets(pluginSheets);
		}
	}

	private finalizeSetup(pm: PluginManager, dom: EditorDOMElements): void {
		if (this.cfg.readonly) {
			pm.setReadOnly(true);
		}

		pm.onEvent(BEFORE_PRINT, (event) => {
			if (!event.options.paperSize && this.deps.configController.getPaperSize()) {
				event.options = {
					...event.options,
					paperSize: this.deps.configController.getPaperSize(),
				};
			}
		});

		if (this.cfg.autofocus) {
			const content: HTMLElement = dom.content;
			requestAnimationFrame(() => content.focus());
		}
	}

	private dispatch(tr: Transaction): void {
		if (!this.view || !this.pluginManager) return;
		if (
			this.deps.configController.isReadOnly &&
			!isAllowedInReadonly(tr) &&
			!this.pluginManager.isReadonlyBypassed()
		) {
			return;
		}
		this.pluginManager.dispatchWithMiddleware(tr, this.view.getState(), (finalTr) =>
			this.view?.dispatch(finalTr),
		);
	}

	private isCancelled(): boolean {
		return this.deps.isCancelled?.() ?? false;
	}

	private async abort(): Promise<null> {
		await this.cleanup();
		return null;
	}

	private async cleanup(): Promise<void> {
		if (this.cleanedUp) return;
		this.cleanedUp = true;

		const liveView: EditorView | null = this.view;
		this.view = null;
		this.paperLayout?.destroy();
		this.paperLayout = null;
		this.deps.styleCoordinator.teardown(this.deps.shadow, this.themeController);
		this.themeController?.destroy();
		this.themeController = null;
		this.inputManager?.destroy();
		this.inputManager = null;
		liveView?.destroy();
		const livePluginManager: PluginManager | null = this.pluginManager;
		this.pluginManager = null;
		await livePluginManager?.destroy();
		this.domElements?.wrapper.remove();
		this.domElements = null;
	}
}

// --- Standalone helpers --------------------------------------------------

async function resolveLocale(cfg: NotectlEditorConfig): Promise<EditorLocale> {
	const localeService = new LocaleService(cfg.locale ?? 'browser');
	const resolvedLang: string = localeService.getLocale();
	return resolvedLang === 'en' ? EDITOR_LOCALE_EN : await loadEditorLocale(resolvedLang);
}

function handleStateChange(
	oldState: EditorState,
	newState: EditorState,
	tr: Transaction,
	domElements: EditorDOMElements,
	pluginManager: PluginManager,
	events: EditorEventEmitter,
): void {
	const announcer: HTMLElement | undefined = domElements.announcer;
	if (announcer) announcer.textContent = '';

	pluginManager.notifyStateChange(oldState, newState, tr);
	updateEmptyState(domElements.content, newState.doc);

	events.emit('stateChange', { oldState, newState, transaction: tr });

	if (!selectionsEqual(oldState.selection, newState.selection)) {
		events.emit('selectionChange', { selection: newState.selection });
	}

	if (!announcer?.textContent) {
		const announcement: string | null = buildAnnouncement(oldState, newState, tr);
		if (announcement && announcer) {
			announcer.textContent = announcement;
		}
	}
}

function updateEmptyState(contentEl: HTMLElement, doc: Document | undefined): void {
	contentEl.classList.toggle('notectl-content--empty', isEditorEmpty(doc));
}
