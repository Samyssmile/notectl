import type { Plugin, PluginContext } from '@notectl/core';
import { type EditorUIService, EditorUIServiceKey, type PopupServiceAPI } from '@notectl/core/ui';

/** This renderer works both in the page and inside a plugin container. */
export function mountControls(ui: EditorUIService, root: HTMLElement): () => void {
	const buttons = document.createElement('div');
	buttons.setAttribute('role', 'group');
	buttons.setAttribute('aria-label', 'Editor actions');
	const label = document.createElement('label');
	label.textContent = 'External text field ';
	const input = document.createElement('input');
	label.append(input);
	const selection = document.createElement('output');
	selection.setAttribute('aria-label', 'Selection geometry');
	const returnButton = document.createElement('button');
	returnButton.type = 'button';
	returnButton.textContent = 'Return to selection';
	returnButton.addEventListener('click', () => ui.focusEditor());
	root.append(buttons, label, returnButton, selection);
	const elements = new Map<string, HTMLButtonElement>();
	const unregister = ui.registerInteraction(root);
	const unsubscribeActions = ui.subscribeActions((actions) => {
		for (const [id, button] of elements) {
			if (!actions.some((action) => action.id === id)) {
				button.remove();
				elements.delete(id);
			}
		}
		for (const action of actions) {
			let button = elements.get(action.id);
			if (!button) {
				button = document.createElement('button');
				button.type = 'button';
				button.dataset.action = action.id;
				const trigger = button;
				button.addEventListener('click', () => {
					if (action.popupType) ui.openAction(action.id, { trigger });
					else ui.executeAction(action.id);
				});
				elements.set(action.id, button);
				buttons.append(button);
			}
			button.textContent = action.value ? `${action.label}: ${action.value}` : action.label;
			button.title = action.tooltip;
			button.disabled = !action.enabled;
			button.setAttribute('aria-pressed', String(action.active));
			if (action.popupType) button.setAttribute('aria-haspopup', 'true');
		}
	});
	const unsubscribeSelection = ui.subscribeSelection((view) => {
		selection.textContent = JSON.stringify(view);
	});
	return () => {
		unsubscribeActions();
		unsubscribeSelection();
		unregister();
		root.replaceChildren();
	};
}

export class TechnicalUIPlugin implements Plugin {
	readonly id = 'technical-ui';
	readonly name = 'Technical UI example';
	private context: PluginContext | null = null;
	private cleanup: (() => void) | null = null;
	private root: HTMLElement | null = null;

	init(context: PluginContext): void {
		this.context = context;
		context.registerStyleSheet(`
			.api-controls { padding: 8px; color: var(--notectl-fg); background: var(--notectl-toolbar-bg); }
			.api-controls button { margin: 2px; }
			.api-controls output { display: block; overflow-wrap: anywhere; font-size: 12px; }
			.api-controls button[aria-pressed="true"] { outline: 2px solid var(--notectl-primary); }
		`);
	}

	onReady(): void {
		const ui = this.context?.getService(EditorUIServiceKey);
		if (!ui || !this.context) return;
		this.root = document.createElement('div');
		this.root.className = 'api-controls';
		this.context.getPluginContainer('bottom').append(this.root);
		this.cleanup = mountControls(ui, this.root);
	}

	destroy(): void {
		this.cleanup?.();
		this.root?.remove();
		this.context = null;
	}
}

/** A custom popup uses the same live anchor and focus ownership as feature popups. */
export function addSelectionPopup(
	ui: EditorUIService,
	popups: PopupServiceAPI,
	root: HTMLElement,
): void {
	const button = document.createElement('button');
	button.type = 'button';
	button.textContent = 'Selection popup';
	button.addEventListener('click', () => {
		if (!ui.getSelection().geometry) return;
		popups.open({
			anchor: ui.createSelectionAnchor('focus'),
			restoreFocusTo: button,
			ariaRole: 'dialog',
			ariaLabel: 'Selection popup',
			className: 'notectl-toolbar-popup',
			content: (container, close) => {
				const label = document.createElement('label');
				label.textContent = 'Popup input ';
				label.append(document.createElement('input'));
				const done = document.createElement('button');
				done.type = 'button';
				done.textContent = 'Close';
				done.addEventListener('click', () => close());
				container.append(label, done);
			},
		});
	});
	root.append(button);
}
