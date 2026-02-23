/**
 * PrintPlugin: provides print functionality for the notectl editor.
 * Registers a command, keymap, toolbar item, and exposes a PrintService.
 * Orchestrator only — delegates all logic to PrintServiceImpl, PrintStyleCollector,
 * and PrintContentPreparer.
 */

import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';
import { createPrintService } from './PrintServiceImpl.js';
import type { PrintOptions, PrintPluginConfig, PrintService } from './PrintTypes.js';
import { PRINT_SERVICE_KEY } from './PrintTypes.js';

const PRINT_ICON: string =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">' +
	'<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3' +
	' 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>' +
	'</svg>';

/** No-op fallback service for environments without ShadowRoot. */
const NOOP_SERVICE: PrintService = {
	print(): void {},
	toHTML(): string {
		return '';
	},
};

export class PrintPlugin implements Plugin {
	readonly id = 'print';
	readonly name = 'Print';

	private readonly config: PrintPluginConfig;
	private service: PrintService | null = null;

	constructor(config?: PrintPluginConfig) {
		this.config = config ?? {};
	}

	init(context: PluginContext): void {
		const container: HTMLElement = context.getContainer();
		const rootNode: Node = container.getRootNode();

		if (rootNode instanceof ShadowRoot) {
			const host: HTMLElement = rootNode.host as HTMLElement;
			const eventBus = context.getEventBus();
			this.service = createPrintService(rootNode, host, container, eventBus);
		} else {
			this.service = NOOP_SERVICE;
		}

		context.registerService(PRINT_SERVICE_KEY, this.service);

		const defaults: PrintOptions = this.config.defaults ?? {};
		const service: PrintService = this.service;

		context.registerCommand('print', () => {
			context.announce('Printing');
			service.print(defaults);
			return true;
		});

		const keyBinding: string = this.config.keyBinding ?? 'Mod-P';
		context.registerKeymap({
			[keyBinding]: () => {
				context.executeCommand('print');
				return true;
			},
		});

		if (this.config.showToolbarItem !== false) {
			const shortcut: string = formatShortcut(keyBinding);
			context.registerToolbarItem({
				id: 'print',
				group: 'actions',
				label: 'Print',
				tooltip: `Print (${shortcut})`,
				icon: PRINT_ICON,
				command: 'print',
				priority: 900,
			});
		}
	}

	destroy(): void {
		this.service = null;
	}
}
