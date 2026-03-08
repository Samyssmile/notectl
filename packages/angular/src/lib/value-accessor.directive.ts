import { Directive } from '@angular/core';

/**
 * @deprecated Angular Forms support is built into `NotectlEditorComponent`.
 *
 * This directive remains as a compatibility shim so existing imports do not break,
 * but it no longer participates in value accessor registration.
 */
@Directive({
	selector: 'ntl-editor[formControl], ntl-editor[formControlName], ntl-editor[ngModel]',
	standalone: true,
})
export class NotectlValueAccessorDirective {}
