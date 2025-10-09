/**
 * Angular module for NotectlEditor
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotectlEditorComponent } from './notectl-editor.component';

@NgModule({
  declarations: [NotectlEditorComponent],
  imports: [CommonModule],
  exports: [NotectlEditorComponent],
})
export class NotectlEditorModule {}
