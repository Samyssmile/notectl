export interface MarkTestConfig {
	/** Display name used in test titles (e.g. "Bold"). */
	name: string;
	/** The `data-mark-type` attribute value. */
	markType: string;
	/** Keyboard shortcut (e.g. "Control+b"). */
	shortcut: string;
	/** Expected HTML tag (e.g. "<strong>"). */
	htmlTag: string;
	/** Toolbar config that hides this mark's button. */
	toolbarHiddenConfig: Record<string, unknown>;
	/** Config that disables this mark as a feature. */
	featureDisabledConfig: Record<string, unknown>;
}

export const MARK_CONFIGS: MarkTestConfig[] = [
	{
		name: 'Bold',
		markType: 'bold',
		shortcut: 'Control+b',
		htmlTag: '<strong>',
		toolbarHiddenConfig: {
			toolbar: { bold: false, italic: true, underline: true },
		},
		featureDisabledConfig: {
			features: { bold: false },
			toolbar: { bold: true, italic: true, underline: true },
		},
	},
	{
		name: 'Italic',
		markType: 'italic',
		shortcut: 'Control+i',
		htmlTag: '<em>',
		toolbarHiddenConfig: {
			toolbar: { bold: true, italic: false, underline: true },
		},
		featureDisabledConfig: {
			features: { italic: false },
			toolbar: { bold: true, italic: true, underline: true },
		},
	},
	{
		name: 'Underline',
		markType: 'underline',
		shortcut: 'Control+u',
		htmlTag: '<u>',
		toolbarHiddenConfig: {
			toolbar: { bold: true, italic: true, underline: false },
		},
		featureDisabledConfig: {
			features: { underline: false },
			toolbar: { bold: true, italic: true, underline: true },
		},
	},
];
