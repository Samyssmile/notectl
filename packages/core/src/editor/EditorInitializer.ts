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
	const cfg: NotectlEditorConfig = deps.config;
	const isCancelled = (): boolean => deps.isCancelled?.() ?? false;
	let themeController: EditorThemeController | null = null;
	let domElements: EditorDOMElements | null = null;
	let paperLayout: PaperLayoutController | null = null;
	let pluginManager: PluginManager | null = null;
	let inputManager: InputManager | null = null;
	let view: EditorView | null = null;
	let cleanedUp = false;

	const release = (): void => {
		view = null;
	};

	const cleanup = async (): Promise<void> => {
		if (cleanedUp) return;
		cleanedUp = true;

		const liveView: EditorView | null = view;
		view = null;
		paperLayout?.destroy();
		paperLayout = null;
		deps.styleCoordinator.teardown(deps.shadow, themeController);
		themeController?.destroy();
		themeController = null;
		inputManager?.destroy();
		inputManager = null;
		liveView?.destroy();
		const livePluginManager: PluginManager | null = pluginManager;
		pluginManager = null;
		await livePluginManager?.destroy();
		domElements?.wrapper.remove();
		domElements = null;
	};

	themeController = new EditorThemeController(deps.shadow);
	deps.styleCoordinator.setup(deps.shadow, cfg.styleNonce, themeController);
	themeController.apply(cfg.theme ?? ThemePreset.Light);
	if (isCancelled()) {
		await cleanup();
		return null;
	}

	const editorLocale: EditorLocale = await resolveLocale(cfg);
	if (isCancelled()) {
		await cleanup();
		return null;
	}

	domElements = createEditorDOM({
		readonly: cfg.readonly,
		placeholder: cfg.placeholder,
		dir: cfg.dir ?? deps.hostDir,
		locale: editorLocale,
	});
	deps.shadow.appendChild(domElements.wrapper);

	if (cfg.paperSize) {
		paperLayout = new PaperLayoutController(domElements.wrapper, domElements.content);
		paperLayout.apply(cfg.paperSize);
	}

	pluginManager = new PluginManager();
	pluginManager.registerService(LocaleServiceKey, new LocaleService(cfg.locale ?? 'browser'));
	registerBuiltinSpecs(pluginManager.schemaRegistry);
	processToolbarConfig(pluginManager, cfg.toolbar);

	for (const plugin of cfg.plugins ?? []) {
		pluginManager.register(plugin);
	}
	for (const plugin of deps.preInitPlugins) {
		pluginManager.register(plugin);
	}
	ensureEssentialPlugins(pluginManager, cfg.features);
	const activeDomElements: EditorDOMElements = domElements;
	const activePluginManager: PluginManager = pluginManager;
	const activeThemeController: EditorThemeController = themeController;

	activeDomElements.content.addEventListener('focus', () => deps.events.emit('focus', undefined));
	activeDomElements.content.addEventListener('blur', () => deps.events.emit('blur', undefined));

	const dispatch = (tr: Transaction): void => {
		if (!view || !pluginManager) return;
		if (
			deps.configController.isReadOnly &&
			!isAllowedInReadonly(tr) &&
			!pluginManager.isReadonlyBypassed()
		) {
			return;
		}
			pluginManager.dispatchWithMiddleware(tr, view.getState(), (finalTr) => view?.dispatch(finalTr));
	};

	await activePluginManager.init({
		isCancelled,
		getState: () => {
			if (!view) throw new Error('View not initialized');
			return view.getState();
		},
		dispatch,
		getContainer: () => activeDomElements.content,
		getPluginContainer: (position) =>
			position === 'top'
				? activeDomElements.topPluginContainer
				: activeDomElements.bottomPluginContainer,
		announce: (text: string) => {
			if (activeDomElements.announcer) activeDomElements.announcer.textContent = text;
		},
		hasAnnouncement: () => !!activeDomElements.announcer?.textContent,
		onBeforeReady: () => {
			if (isCancelled() || !pluginManager || !themeController) return;
			const schema = schemaFromRegistry(activePluginManager.schemaRegistry);
			const state: EditorState = EditorState.create({ schema });

			inputManager = new InputManager(activeDomElements.content, {
				getState: () => {
					if (!view) throw new Error('View not initialized');
					return view.getState();
				},
				dispatch,
				syncSelection: () => view?.syncSelection(),
				undo: () => view?.undo(),
				redo: () => view?.redo(),
				schemaRegistry: activePluginManager.schemaRegistry,
				keymapRegistry: activePluginManager.keymapRegistry,
				inputRuleRegistry: activePluginManager.inputRuleRegistry,
				fileHandlerRegistry: activePluginManager.fileHandlerRegistry,
				isReadOnly: () => deps.configController.isReadOnly,
				getPasteInterceptors: () => activePluginManager.getPasteInterceptors(),
				getTextDirection,
				navigateFromGapCursor,
			});

			view = new EditorView(activeDomElements.content, {
				state,
				schemaRegistry: activePluginManager.schemaRegistry,
				keymapRegistry: activePluginManager.keymapRegistry,
				fileHandlerRegistry: activePluginManager.fileHandlerRegistry,
				nodeViewRegistry: activePluginManager.nodeViewRegistry,
				maxHistoryDepth: cfg.maxHistoryDepth,
				getDecorations: (s, tr) =>
					activePluginManager.collectDecorations(s, tr) ?? DecorationSet.empty,
				onStateChange: (oldState, newState, tr) => {
					handleStateChange(
						oldState,
						newState,
						tr,
						activeDomElements,
						activePluginManager,
						deps.events,
					);
				},
				isReadOnly: () => deps.configController.isReadOnly,
				compositionState: inputManager.compositionTracker,
			});

			updateEmptyState(activeDomElements.content, view.getState().doc);

			const pluginSheets: readonly CSSStyleSheet[] = activePluginManager.getPluginStyleSheets();
			if (pluginSheets.length > 0) {
				activeThemeController.setPluginStyleSheets(pluginSheets);
			}
		},
	});

	if (isCancelled() || !view || !inputManager || !pluginManager || !domElements || !themeController) {
		await cleanup();
		return null;
	}

	if (cfg.readonly) {
		activePluginManager.setReadOnly(true);
	}

	activePluginManager.onEvent(BEFORE_PRINT, (event) => {
		if (!event.options.paperSize && deps.configController.getPaperSize()) {
			event.options = { ...event.options, paperSize: deps.configController.getPaperSize() };
		}
	});

	if (cfg.autofocus) {
		requestAnimationFrame(() => activeDomElements.content.focus());
	}

	return {
		view,
		inputManager,
		pluginManager: activePluginManager,
		domElements: activeDomElements,
		themeController: activeThemeController,
		paperLayout,
		release,
	};
}

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
