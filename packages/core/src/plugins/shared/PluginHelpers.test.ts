import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { dispatchIfPresent } from './PluginHelpers.js';

function fakeContext(): { context: PluginContext; dispatch: ReturnType<typeof vi.fn> } {
	const dispatch = vi.fn();
	return { context: { dispatch } as unknown as PluginContext, dispatch };
}

describe('dispatchIfPresent', () => {
	it('dispatches and returns true when the transaction is present', () => {
		const { context, dispatch } = fakeContext();
		const tr = {} as Transaction;

		const result = dispatchIfPresent(context, tr);

		expect(result).toBe(true);
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith(tr);
	});

	it('does nothing and returns false when the transaction is null', () => {
		const { context, dispatch } = fakeContext();

		const result = dispatchIfPresent(context, null);

		expect(result).toBe(false);
		expect(dispatch).not.toHaveBeenCalled();
	});
});
