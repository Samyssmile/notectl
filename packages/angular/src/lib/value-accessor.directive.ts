import { DestroyRef, Directive, forwardRef, inject } from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { Document, StateChangeEvent } from '@notectl/core';

import { NotectlEditorComponent } from './notectl-editor.component';
import { type ContentFormat, NOTECTL_CONTENT_FORMAT } from './tokens';

type OnChangeFn = (value: Document | string | null) => void;
type OnTouchedFn = () => void;

/** Escapes HTML special characters to prevent XSS when inserting plain text. */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * `ControlValueAccessor` directive for Angular forms integration.
 *
 * Supports Reactive Forms (`formControl`, `formControlName`) and
 * template-driven forms (`ngModel`).
 *
 * The content format is configurable via `provideNotectl({ contentFormat })` or
 * the `NOTECTL_CONTENT_FORMAT` injection token:
 * - `'json'` (default) — form value is a `Document` object
 * - `'html'` — form value is a sanitized HTML string
 * - `'text'` — form value is a plain text string
 */
@Directive({
	selector: 'ntl-editor[formControl], ntl-editor[formControlName], ntl-editor[ngModel]',
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => NotectlValueAccessorDirective),
			multi: true,
		},
	],
})
export class NotectlValueAccessorDirective implements ControlValueAccessor {
	private readonly editor: NotectlEditorComponent = inject(NotectlEditorComponent);
	private readonly destroyRef: DestroyRef = inject(DestroyRef);
	private readonly format: ContentFormat =
		inject(NOTECTL_CONTENT_FORMAT, { optional: true }) ?? 'json';

	private onChange: OnChangeFn = () => {};
	private onTouched: OnTouchedFn = () => {};
	private pendingValue: Document | string | null = null;
	private suppressEmit = false;

	private readonly stateChangeSub = this.editor.stateChange.subscribe(
		(_event: StateChangeEvent) => {
			if (this.suppressEmit) return;
			const value: Document | string | null = this.readValue();
			this.onChange(value);
		},
	);

	private readonly blurSub = this.editor.editorBlur.subscribe(() => {
		this.onTouched();
	});

	constructor() {
		this.destroyRef.onDestroy(() => {
			this.stateChangeSub.unsubscribe();
			this.blurSub.unsubscribe();
		});
	}

	writeValue(value: Document | string | null): void {
		if (!value) return;

		try {
			this.editor.getState();
			this.writeValueToEditor(value);
			return;
		} catch {
			// Editor not ready yet — defer
		}

		this.pendingValue = value;
		this.editor.whenReady().then(() => {
			if (this.pendingValue !== null) {
				this.writeValueToEditor(this.pendingValue);
				this.pendingValue = null;
			}
		});
	}

	registerOnChange(fn: OnChangeFn): void {
		this.onChange = fn;
	}

	registerOnTouched(fn: OnTouchedFn): void {
		this.onTouched = fn;
	}

	setDisabledState(isDisabled: boolean): void {
		this.editor.setReadonly(isDisabled);
	}

	private writeValueToEditor(value: Document | string): void {
		this.suppressEmit = true;
		try {
			if (this.format === 'json' && typeof value === 'object') {
				this.editor.setJSON(value as Document);
			} else if (this.format === 'html' && typeof value === 'string') {
				this.editor.setHTML(value);
			} else if (this.format === 'text' && typeof value === 'string') {
				this.editor.setHTML(`<p>${escapeHtml(value)}</p>`);
			} else if (typeof value === 'string') {
				this.editor.setHTML(value);
			} else {
				this.editor.setJSON(value as Document);
			}
		} finally {
			this.suppressEmit = false;
		}
	}

	private readValue(): Document | string | null {
		try {
			switch (this.format) {
				case 'html':
					return this.editor.getHTML();
				case 'text':
					return this.editor.getText();
				default:
					return this.editor.getJSON();
			}
		} catch {
			return null;
		}
	}
}
