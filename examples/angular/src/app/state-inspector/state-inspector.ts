import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { EditorState, Transaction } from '@notectl/angular';

import { JsonSyntaxPipe } from './json-syntax.pipe';

interface TransactionSummary {
	readonly origin: string;
	readonly timestamp: number;
	readonly stepCount: number;
	readonly stepTypes: readonly string[];
	readonly historyDirection?: string;
}

@Component({
	selector: 'app-state-inspector',
	imports: [JsonSyntaxPipe],
	templateUrl: './state-inspector.html',
	styleUrl: './state-inspector.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StateInspectorComponent {
	readonly state = input<EditorState | null>(null);
	readonly lastTransaction = input<Transaction | null>(null);
	readonly transactionCount = input(0);

	protected readonly collapsedSections = signal(new Set<string>());

	protected readonly documentJson = computed(() => {
		const s = this.state();
		if (!s) return '{}';
		return JSON.stringify(s.doc, null, 2);
	});

	protected readonly selectionJson = computed(() => {
		const s = this.state();
		if (!s) return '{}';
		return JSON.stringify(s.selection, null, 2);
	});

	protected readonly transactionJson = computed(() => {
		const tr = this.lastTransaction();
		if (!tr) return '"No transactions yet"';

		const summary: TransactionSummary = {
			origin: tr.metadata.origin,
			timestamp: tr.metadata.timestamp,
			stepCount: tr.steps.length,
			stepTypes: tr.steps.map((step) => step.type),
			...(tr.metadata.historyDirection
				? { historyDirection: tr.metadata.historyDirection }
				: {}),
		};
		return JSON.stringify(summary, null, 2);
	});

	protected isExpanded(section: string): boolean {
		return !this.collapsedSections().has(section);
	}

	protected toggleSection(section: string): void {
		this.collapsedSections.update((prev) => {
			const next = new Set(prev);
			if (next.has(section)) {
				next.delete(section);
			} else {
				next.add(section);
			}
			return next;
		});
	}
}
