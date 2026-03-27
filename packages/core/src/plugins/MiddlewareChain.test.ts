import { describe, expect, it, vi } from 'vitest';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { MiddlewareChain } from './MiddlewareChain.js';
import type { MiddlewareEntry } from './PluginContextFactory.js';

function makeTr(): Transaction {
	return { steps: [], origin: 'command' } as unknown as Transaction;
}

function makeState(): EditorState {
	return {} as unknown as EditorState;
}

function makeEntry(
	name: string,
	priority: number,
	middleware: MiddlewareEntry['middleware'],
): MiddlewareEntry {
	return { name, pluginId: `plugin-${name}`, middleware, priority };
}

describe('MiddlewareChain', () => {
	it('calls finalDispatch directly when no middleware', () => {
		const chain = new MiddlewareChain();
		const finalDispatch = vi.fn();
		chain.dispatch(makeTr(), makeState(), finalDispatch);
		expect(finalDispatch).toHaveBeenCalledOnce();
	});

	it('executes single middleware then finalDispatch', () => {
		const chain = new MiddlewareChain();
		const order: string[] = [];
		chain.addMiddleware(
			makeEntry('a', 100, (tr, _state, next) => {
				order.push('a');
				next(tr);
			}),
		);

		const finalDispatch = vi.fn(() => order.push('final'));
		chain.dispatch(makeTr(), makeState(), finalDispatch);
		expect(order).toEqual(['a', 'final']);
	});

	it('dispatches in priority order', () => {
		const chain = new MiddlewareChain();
		const order: string[] = [];
		chain.addMiddleware(
			makeEntry('high', 200, (tr, _state, next) => {
				order.push('high');
				next(tr);
			}),
		);
		chain.addMiddleware(
			makeEntry('low', 50, (tr, _state, next) => {
				order.push('low');
				next(tr);
			}),
		);

		chain.dispatch(makeTr(), makeState(), () => order.push('final'));
		expect(order).toEqual(['low', 'high', 'final']);
	});

	it('allows middleware to suppress dispatch by not calling next', () => {
		const chain = new MiddlewareChain();
		chain.addMiddleware(makeEntry('blocker', 100, () => {}));

		const finalDispatch = vi.fn();
		chain.dispatch(makeTr(), makeState(), finalDispatch);
		expect(finalDispatch).not.toHaveBeenCalled();
	});

	it('guards against multiple next() calls', () => {
		const chain = new MiddlewareChain();
		chain.addMiddleware(
			makeEntry('double', 100, (tr, _state, next) => {
				next(tr);
				next(tr);
			}),
		);

		const finalDispatch = vi.fn();
		chain.dispatch(makeTr(), makeState(), finalDispatch);
		expect(finalDispatch).toHaveBeenCalledOnce();
	});

	it('isolates middleware errors and continues chain', () => {
		const chain = new MiddlewareChain();
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const order: string[] = [];

		chain.addMiddleware(
			makeEntry('bad', 50, () => {
				throw new Error('boom');
			}),
		);
		chain.addMiddleware(
			makeEntry('good', 100, (tr, _state, next) => {
				order.push('good');
				next(tr);
			}),
		);

		chain.dispatch(makeTr(), makeState(), () => order.push('final'));
		expect(order).toEqual(['good', 'final']);
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});

	it('returns middleware chain for introspection', () => {
		const chain = new MiddlewareChain();
		chain.addMiddleware(makeEntry('b', 200, (_tr, _s, next) => next(_tr)));
		chain.addMiddleware(makeEntry('a', 50, (_tr, _s, next) => next(_tr)));

		const info = chain.getChain();
		expect(info).toHaveLength(2);
		expect(info[0]?.name).toBe('a');
		expect(info[1]?.name).toBe('b');
	});

	it('removes middleware', () => {
		const chain = new MiddlewareChain();
		const entry = makeEntry('a', 100, (_tr, _s, next) => next(_tr));
		chain.addMiddleware(entry);
		chain.removeMiddleware(entry);
		expect(chain.getChain()).toHaveLength(0);
	});

	it('manages paste interceptors with priority sorting', () => {
		const chain = new MiddlewareChain();
		const interceptorA = {
			name: 'a',
			pluginId: 'p1',
			interceptor: vi.fn(),
			priority: 200,
		};
		const interceptorB = {
			name: 'b',
			pluginId: 'p2',
			interceptor: vi.fn(),
			priority: 50,
		};

		chain.addPasteInterceptor(interceptorA);
		chain.addPasteInterceptor(interceptorB);

		const sorted = chain.getPasteInterceptors();
		expect(sorted).toHaveLength(2);
		expect(sorted[0]?.name).toBe('b');
		expect(sorted[1]?.name).toBe('a');
	});

	it('clears all middleware and paste interceptors', () => {
		const chain = new MiddlewareChain();
		chain.addMiddleware(makeEntry('a', 100, (_tr, _s, next) => next(_tr)));
		chain.addPasteInterceptor({
			name: 'p',
			pluginId: 'p1',
			interceptor: vi.fn(),
			priority: 100,
		});
		chain.clear();
		expect(chain.getChain()).toHaveLength(0);
		expect(chain.getPasteInterceptors()).toHaveLength(0);
	});
});
