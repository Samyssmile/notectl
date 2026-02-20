import { describe, expect, it } from 'vitest';
import {
	NOTECTL_CONTENT_FORMAT,
	NOTECTL_DEFAULT_CONFIG,
	type NotectlProviderOptions,
	provideNotectl,
} from './tokens.js';

describe('InjectionTokens', () => {
	it('should export NOTECTL_DEFAULT_CONFIG token', () => {
		expect(NOTECTL_DEFAULT_CONFIG).toBeDefined();
		expect(NOTECTL_DEFAULT_CONFIG.toString()).toContain('notectl-default-config');
	});

	it('should export NOTECTL_CONTENT_FORMAT token', () => {
		expect(NOTECTL_CONTENT_FORMAT).toBeDefined();
		expect(NOTECTL_CONTENT_FORMAT.toString()).toContain('notectl-content-format');
	});
});

describe('provideNotectl', () => {
	it('should be a function', () => {
		expect(typeof provideNotectl).toBe('function');
	});

	it('should accept empty options', () => {
		const providers = provideNotectl();
		expect(providers).toBeDefined();
	});

	it('should accept config option', () => {
		const options: NotectlProviderOptions = {
			config: { placeholder: 'Custom placeholder' },
		};
		const providers = provideNotectl(options);
		expect(providers).toBeDefined();
	});

	it('should accept contentFormat option', () => {
		const options: NotectlProviderOptions = {
			contentFormat: 'html',
		};
		const providers = provideNotectl(options);
		expect(providers).toBeDefined();
	});

	it('should accept all options combined', () => {
		const options: NotectlProviderOptions = {
			config: { placeholder: 'Test', readonly: true },
			contentFormat: 'text',
		};
		const providers = provideNotectl(options);
		expect(providers).toBeDefined();
	});
});
