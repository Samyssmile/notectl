import { describe, expect, it, vi } from 'vitest';
import { dispatchFilesToHandlers } from './FileHandlerDispatcher.js';
import { type FileHandler, FileHandlerRegistry } from './FileHandlerRegistry.js';

function imageFile(): File {
	return new File(['image'], 'image.png', { type: 'image/png' });
}

describe('dispatchFilesToHandlers', () => {
	it('uses a stable handler snapshot when a synchronous handler unregisters itself', () => {
		const registry = new FileHandlerRegistry();
		const second = vi.fn(() => true);
		const first: FileHandler = () => {
			registry.removeFileHandler(first);
			return false;
		};
		registry.registerFileHandler('image/*', first);
		registry.registerFileHandler('image/*', second);

		const outcome = dispatchFilesToHandlers({
			registry,
			files: [imageFile()],
			getPosition: () => null,
		});

		expect(outcome).toEqual({ handled: true, cancelled: false });
		expect(second).toHaveBeenCalledTimes(1);
	});

	it('uses a stable handler snapshot while awaiting an asynchronous handler', async () => {
		const registry = new FileHandlerRegistry();
		const second = vi.fn(() => true);
		const first: FileHandler = async () => {
			await Promise.resolve();
			registry.removeFileHandler(first);
			return false;
		};
		registry.registerFileHandler('image/*', first);
		registry.registerFileHandler('image/*', second);

		const outcome = dispatchFilesToHandlers({
			registry,
			files: [imageFile()],
			getPosition: () => null,
		});

		await expect(outcome).resolves.toEqual({ handled: true, cancelled: false });
		expect(second).toHaveBeenCalledTimes(1);
	});

	it('reports cancellation when the owner becomes inactive during the final async handler', async () => {
		const registry = new FileHandlerRegistry();
		let resolveHandler = (_handled: boolean): void => {};
		const pendingHandler = new Promise<boolean>((resolve) => {
			resolveHandler = resolve;
		});
		let active = true;
		registry.registerFileHandler('image/*', () => pendingHandler);

		const outcome = dispatchFilesToHandlers({
			registry,
			files: [imageFile()],
			getPosition: () => null,
			isActive: () => active,
		});

		active = false;
		resolveHandler(true);

		await expect(outcome).resolves.toEqual({ handled: true, cancelled: true });
	});
});
