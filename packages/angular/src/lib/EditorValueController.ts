import type { Document, NotectlEditor } from '@notectl/core';

import type { ContentFormat } from './tokens';
import type { NotectlValue } from './types';
import { readEditorValue, writeEditorValue } from './value-interop';

interface EditorValueControllerOptions {
	readonly getEditor: () => NotectlEditor | null;
	readonly getFormat: () => ContentFormat;
	readonly whenReady: () => Promise<void>;
	readonly updateContent: (doc: Document) => void;
	readonly emitControlValue: (value: NotectlValue) => void;
}

export class EditorValueController {
	private readonly options: EditorValueControllerOptions;
	private lastDocument: Document | undefined;
	private mutedControlChanges = 0;
	private serializedReadVersion = 0;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(options: EditorValueControllerOptions) {
		this.options = options;
	}

	reset(): void {
		this.lastDocument = undefined;
		this.serializedReadVersion++;
	}

	handleEditorStateChange(doc: Document): void {
		this.lastDocument = doc;
		this.options.updateContent(doc);

		if (this.mutedControlChanges > 0) return;

		const readVersion = ++this.serializedReadVersion;
		void this.readCurrentValue().then((value: NotectlValue) => {
			if (readVersion !== this.serializedReadVersion) return;
			this.options.emitControlValue(value);
		});
	}

	syncExternalContent(doc: Document): void {
		if (doc === this.lastDocument) return;
		this.lastDocument = doc;
		void this.enqueueSilent(async (editor: NotectlEditor) => {
			editor.setJSON(doc);
		});
	}

	writeControlValue(value: NotectlValue): void {
		void this.enqueueSilent(async (editor: NotectlEditor) => {
			await writeEditorValue(editor, this.options.getFormat(), value);
		});
	}

	setDocument(doc: Document): Promise<void> {
		this.lastDocument = doc;
		return this.enqueueInteractive(async (editor: NotectlEditor) => {
			editor.setJSON(doc);
		});
	}

	setSerializedValue(value: NotectlValue): Promise<void> {
		return this.enqueueInteractive(async (editor: NotectlEditor) => {
			await writeEditorValue(editor, this.options.getFormat(), value);
		});
	}

	applyInitialDocument(editor: NotectlEditor, doc: Document): Promise<void> {
		this.lastDocument = doc;
		return this.runSilent(async () => {
			editor.setJSON(doc);
		});
	}

	private async readCurrentValue(): Promise<NotectlValue> {
		const editor: NotectlEditor | null = this.options.getEditor();
		if (!editor) return null;
		return readEditorValue(editor, this.options.getFormat());
	}

	private enqueueSilent(task: (editor: NotectlEditor) => Promise<void>): Promise<void> {
		return this.enqueue(task, true);
	}

	private enqueueInteractive(task: (editor: NotectlEditor) => Promise<void>): Promise<void> {
		return this.enqueue(task, false);
	}

	private enqueue(task: (editor: NotectlEditor) => Promise<void>, silent: boolean): Promise<void> {
		const next = this.writeQueue.then(async () => {
			await this.options.whenReady();
			const editor: NotectlEditor | null = this.options.getEditor();
			if (!editor) return;

			if (silent) {
				await this.runSilent(() => task(editor));
				return;
			}

			await task(editor);
		});

		this.writeQueue = next.catch(() => undefined);
		return next;
	}

	private async runSilent(task: () => Promise<void>): Promise<void> {
		this.mutedControlChanges++;
		try {
			await task();
		} finally {
			this.mutedControlChanges--;
		}
	}
}
