import { expect, test } from '../fixtures/angular-editor-page';

// Runtime proof for #185: the Angular wrapper's getContentHTML must forward the
// `includeBlockIds` option to core so consumers can produce clean export HTML.
test.describe('Angular — getContentHTML option forwarding (#185)', () => {
	test('default export keeps data-block-id (round-trip wire format)', async ({ editor }) => {
		await editor.typeText('Export me');

		await editor.page
			.locator('.controls')
			.getByRole('button', { name: 'Get HTML', exact: true })
			.click();

		await expect(editor.output).toContainText('data-block-id');
	});

	test('includeBlockIds: false strips data-block-id from the export', async ({ editor }) => {
		await editor.typeText('Export me');

		await editor.controlButton('Get HTML (no IDs)').click();

		await expect(editor.output).toContainText('Export me');
		await expect(editor.output).not.toContainText('data-block-id');
	});
});
