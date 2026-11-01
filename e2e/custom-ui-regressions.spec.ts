import type { NotectlEditor } from '../packages/core/src/editor/NotectlEditor.js';
import { expect, test } from './fixtures/editor-page';

test.beforeEach(async ({ editor }) => {
	await editor.goto();
});

for (const dir of ['ltr', 'rtl'] as const) {
	for (const marked of [false, true]) {
		test(`measures ${dir} atomic inline endpoints with marks=${marked}`, async ({ editor }) => {
			const result = await editor.root.evaluate(
				async (element, { dir, marked }) => {
					const editor = element as NotectlEditor;
					const uiModule = '/node_modules/@notectl/core/dist/ui.mjs';
					const { EditorUIServiceKey }: typeof import('../packages/core/src/ui.js') = await import(
						uiModule
					);
					const ui = editor.getService(EditorUIServiceKey);
					if (!ui) throw new Error('Missing UI service');
					editor.configure({ dir });
					const math = '<math><mi>x</mi></math>';
					// Include a leading atom as well as the reported trailing atom after text.
					await editor.setContentHTML(
						`<p>${marked ? `<strong>${math}</strong>` : math}abc${marked ? `<strong>${math}</strong>` : math}</p>`,
					);
					const state = editor.getState();
					const block = state.doc.children[0];
					if (!block) throw new Error('Missing block');
					const measure = (anchor: number, head: number) => {
						editor.dispatch(
							editor
								.getState()
								.transaction('api')
								.setSelection({
									anchor: { blockId: block.id, offset: anchor },
									head: { blockId: block.id, offset: head },
								})
								.build(),
						);
						return ui.getSelection();
					};
					const start = measure(0, 0);
					const end = measure(5, 5);
					const forward = measure(0, 5);
					const backward = measure(5, 0);
					const atoms = editor.shadowRoot?.querySelectorAll('.notectl-math--inline');
					const first = atoms?.[0]?.getBoundingClientRect();
					const last = atoms?.[1]?.getBoundingClientRect();
					if (!first || !last) throw new Error('Missing formulas');
					const opened = !!ui.openAction('fontSize');
					return {
						start,
						end,
						forward,
						backward,
						opened,
						startX: dir === 'rtl' ? first.right : first.left,
						endX: dir === 'rtl' ? last.left : last.right,
					};
				},
				{ dir, marked },
			);
			expect(result.start.geometry).not.toBeNull();
			expect(result.end.geometry).not.toBeNull();
			expect(result.forward.geometry?.rects.length).toBeGreaterThan(0);
			expect(result.start.geometry?.anchor.x).toBeCloseTo(result.startX, 1);
			expect(result.end.geometry?.focus.x).toBeCloseTo(result.endX, 1);
			expect(result.forward.geometry?.anchor).toEqual(result.start.geometry?.anchor);
			expect(result.forward.geometry?.focus).toEqual(result.end.geometry?.focus);
			expect(result.backward.geometry?.bounds).toEqual(result.forward.geometry?.bounds);
			expect(result.backward.geometry?.anchor).toEqual(result.forward.geometry?.focus);
			expect(result.backward.geometry?.focus).toEqual(result.forward.geometry?.anchor);
			expect(result.opened).toBe(true);
			await expect(editor.popup()).toBeVisible();
		});
	}
}

for (const handling of ['override', 'prevent'] as const) {
	test(`respects a popup container Escape handler: ${handling}`, async ({ editor, page }) => {
		await editor.root.evaluate(async (element, handling) => {
			const editor = element as NotectlEditor;
			const uiModule = '/node_modules/@notectl/core/dist/ui.mjs';
			const { PopupServiceKey }: typeof import('../packages/core/src/ui.js') = await import(
				uiModule
			);
			const popups = editor.getService(PopupServiceKey);
			if (!popups) throw new Error('Missing popup service');
			const trigger = document.createElement('button');
			trigger.id = 'default-focus';
			const other = document.createElement('button');
			other.id = 'override-focus';
			document.body.append(trigger, other);
			popups.open({
				anchor: trigger,
				restoreFocusTo: trigger,
				ariaRole: 'dialog',
				ariaLabel: 'Escape regression',
				content(container, close) {
					container.append(document.createElement('input'));
					container.addEventListener('keydown', (event) => {
						if (event.key !== 'Escape') return;
						if (handling === 'prevent') event.preventDefault();
						else close({ restoreFocusTo: other });
					});
				},
			});
		}, handling);
		const popup = page.getByRole('dialog', { name: 'Escape regression' });
		await popup.locator('input').press('Escape');
		if (handling === 'override') {
			await expect(popup).toHaveCount(0);
			await expect(page.locator('#override-focus')).toBeFocused();
		} else {
			await expect(popup).toBeVisible();
			await expect(popup.locator('input')).toBeFocused();
		}
	});
}

for (const target of ['content', 'host', 'ancestor'] as const) {
	for (const visibility of ['hidden', 'collapse'] as const) {
		test(`invalidates selection anchors when ${target} visibility is ${visibility}`, async ({
			editor,
			page,
		}) => {
			await editor.root.evaluate(async (element) => {
				const editor = element as NotectlEditor;
				const uiModule = '/node_modules/@notectl/core/dist/ui.mjs';
				const { EditorUIServiceKey, PopupServiceKey }: typeof import('../packages/core/src/ui.js') =
					await import(uiModule);
				const ui = editor.getService(EditorUIServiceKey);
				const popups = editor.getService(PopupServiceKey);
				if (!ui || !popups) throw new Error('Missing UI services');
				editor.setText('Visible selection');
				const output = document.createElement('output');
				output.id = 'selection-visible';
				document.body.append(output);
				ui.subscribeSelection((view) => {
					output.textContent = String(view.geometry !== null);
				});
				popups.open({
					anchor: ui.createSelectionAnchor(),
					ariaRole: 'dialog',
					ariaLabel: 'Visibility regression',
					content(container) {
						container.append(document.createElement('input'));
					},
				});
			});
			const popup = page.getByRole('dialog', { name: 'Visibility regression' });
			const output = page.locator('#selection-visible');
			await expect(popup).toBeVisible();
			await expect(output).toHaveText('true');
			await editor.root.evaluate(
				(element, { target, visibility }) => {
					const hidden =
						target === 'host'
							? element
							: target === 'ancestor'
								? element.parentElement
								: element.shadowRoot?.querySelector<HTMLElement>('[role="textbox"]');
					if (!hidden) throw new Error('Missing visibility target');
					hidden.style.visibility = visibility;
					hidden.setAttribute('data-visibility-target', '');
				},
				{ target, visibility },
			);
			await expect(output).toHaveText('false');
			await expect(popup).toHaveCount(0);
			if (target !== 'content') {
				// CSS permits a descendant to explicitly restore visibility.
				await editor.content.evaluate((element) => {
					(element as HTMLElement).style.visibility = 'visible';
				});
				await expect(output).toHaveText('true');
				await editor.content.evaluate((element) => {
					(element as HTMLElement).style.removeProperty('visibility');
				});
				await expect(output).toHaveText('false');
			}
			await page.locator('[data-visibility-target]').evaluate((element) => {
				(element as HTMLElement).style.removeProperty('visibility');
			});
			await expect(output).toHaveText('true');
		});
	}
}
