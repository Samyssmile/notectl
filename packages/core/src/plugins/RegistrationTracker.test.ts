import { describe, expect, it, vi } from 'vitest';
import type { PluginRegistrations } from './PluginContextFactory.js';
import type { RegistrationCleanupDeps } from './RegistrationTracker.js';
import { RegistrationTracker } from './RegistrationTracker.js';

function makeDeps(): RegistrationCleanupDeps {
	return {
		commandRegistry: { remove: vi.fn() } as never,
		serviceRegistry: { remove: vi.fn() } as never,
		middlewareChain: {
			removeMiddleware: vi.fn(),
			removePasteInterceptor: vi.fn(),
		} as never,
		schemaRegistry: {
			removeNodeSpec: vi.fn(),
			removeMarkSpec: vi.fn(),
			removeInlineNodeSpec: vi.fn(),
		} as never,
		keymapRegistry: { removeKeymap: vi.fn() } as never,
		inputRuleRegistry: { removeInputRule: vi.fn() } as never,
		nodeViewRegistry: { removeNodeView: vi.fn() } as never,
		toolbarRegistry: { removeToolbarItem: vi.fn() } as never,
		fileHandlerRegistry: { removeFileHandler: vi.fn() } as never,
		blockTypePickerRegistry: { removeBlockTypePickerEntry: vi.fn() } as never,
	};
}

function makeRegistrations(overrides?: Partial<PluginRegistrations>): PluginRegistrations {
	return {
		commands: [],
		services: [],
		middlewares: [],
		pasteInterceptors: [],
		unsubscribers: [],
		nodeSpecs: [],
		markSpecs: [],
		inlineNodeSpecs: [],
		nodeViews: [],
		keymaps: [],
		inputRules: [],
		toolbarItems: [],
		fileHandlers: [],
		blockTypePickerEntries: [],
		stylesheets: [],
		...overrides,
	};
}

describe('RegistrationTracker', () => {
	it('cleans up commands on cleanup', () => {
		const deps = makeDeps();
		const tracker = new RegistrationTracker(deps);
		tracker.track('p1', makeRegistrations({ commands: ['bold', 'italic'] }));

		tracker.cleanup('p1');
		expect(deps.commandRegistry.remove).toHaveBeenCalledWith('bold');
		expect(deps.commandRegistry.remove).toHaveBeenCalledWith('italic');
	});

	it('cleans up services on cleanup', () => {
		const deps = makeDeps();
		const tracker = new RegistrationTracker(deps);
		tracker.track('p1', makeRegistrations({ services: ['locale'] }));

		tracker.cleanup('p1');
		expect(deps.serviceRegistry.remove).toHaveBeenCalledWith('locale');
	});

	it('cleans up schema specs on cleanup', () => {
		const deps = makeDeps();
		const tracker = new RegistrationTracker(deps);
		tracker.track(
			'p1',
			makeRegistrations({
				nodeSpecs: ['heading'],
				markSpecs: ['bold'],
				inlineNodeSpecs: ['emoji'],
			}),
		);

		tracker.cleanup('p1');
		expect(deps.schemaRegistry.removeNodeSpec).toHaveBeenCalledWith('heading');
		expect(deps.schemaRegistry.removeMarkSpec).toHaveBeenCalledWith('bold');
		expect(deps.schemaRegistry.removeInlineNodeSpec).toHaveBeenCalledWith('emoji');
	});

	it('calls unsubscribers on cleanup', () => {
		const deps = makeDeps();
		const tracker = new RegistrationTracker(deps);
		const unsub = vi.fn();
		tracker.track('p1', makeRegistrations({ unsubscribers: [unsub] }));

		tracker.cleanup('p1');
		expect(unsub).toHaveBeenCalledOnce();
	});

	it('removes stylesheets from raw array on cleanup', () => {
		const deps = makeDeps();
		const tracker = new RegistrationTracker(deps);
		const sheet = new CSSStyleSheet();
		tracker.rawStyleSheets.push(sheet);
		tracker.track('p1', makeRegistrations({ stylesheets: [sheet] }));

		tracker.cleanup('p1');
		expect(tracker.rawStyleSheets).toHaveLength(0);
	});

	it('no-ops for unknown plugin', () => {
		const deps = makeDeps();
		const tracker = new RegistrationTracker(deps);
		tracker.cleanup('unknown');
		expect(deps.commandRegistry.remove).not.toHaveBeenCalled();
	});

	it('clears all registrations', () => {
		const deps = makeDeps();
		const tracker = new RegistrationTracker(deps);
		tracker.rawStyleSheets.push(new CSSStyleSheet());
		tracker.track('p1', makeRegistrations({ commands: ['bold'] }));

		tracker.clear();
		expect(tracker.rawStyleSheets).toHaveLength(0);
	});
});
