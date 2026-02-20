/**
 * Theme token types, built-in themes, and theme creation helpers.
 */

/** Primitive color palette a theme defines. */
export interface ThemePrimitives {
	readonly background: string;
	readonly foreground: string;
	readonly mutedForeground: string;
	readonly border: string;
	readonly borderFocus: string;
	readonly primary: string;
	readonly primaryForeground: string;
	readonly primaryMuted: string;
	readonly surfaceRaised: string;
	readonly surfaceOverlay: string;
	readonly hoverBackground: string;
	readonly activeBackground: string;
	readonly danger: string;
	readonly dangerMuted: string;
	readonly success: string;
	readonly shadow: string;
	readonly focusRing: string;
}

/** Component-level toolbar overrides. */
export interface ThemeToolbar {
	readonly background: string;
	readonly borderColor: string;
}

/** Component-level code block overrides. */
export interface ThemeCodeBlock {
	readonly background: string;
	readonly foreground: string;
	readonly headerBackground: string;
	readonly headerForeground: string;
	readonly headerBorder: string;
}

/** Component-level tooltip overrides. */
export interface ThemeTooltip {
	readonly background: string;
	readonly foreground: string;
}

/** Full theme definition. */
export interface Theme {
	readonly name: string;
	readonly primitives: ThemePrimitives;
	readonly toolbar?: Partial<ThemeToolbar>;
	readonly codeBlock?: Partial<ThemeCodeBlock>;
	readonly tooltip?: Partial<ThemeTooltip>;
}

/** Partial custom theme — deeply partial for creating overrides. */
export interface PartialTheme {
	readonly name: string;
	readonly primitives?: Partial<ThemePrimitives>;
	readonly toolbar?: Partial<ThemeToolbar>;
	readonly codeBlock?: Partial<ThemeCodeBlock>;
	readonly tooltip?: Partial<ThemeTooltip>;
}

/** Built-in theme presets. */
export const ThemePreset = {
	Light: 'light',
	Dark: 'dark',
	System: 'system',
} as const;
export type ThemePreset = (typeof ThemePreset)[keyof typeof ThemePreset];

/** Built-in light theme. */
export const LIGHT_THEME: Theme = {
	name: 'light',
	primitives: {
		background: '#ffffff',
		foreground: '#1a1a1a',
		mutedForeground: '#666666',
		border: '#d0d0d0',
		borderFocus: '#4a90d9',
		primary: '#4a90d9',
		primaryForeground: '#1a5fa0',
		primaryMuted: '#d0e0f0',
		surfaceRaised: '#f8f8f8',
		surfaceOverlay: '#ffffff',
		hoverBackground: '#e8e8e8',
		activeBackground: '#d0e0f0',
		danger: '#dc2626',
		dangerMuted: '#fee2e2',
		success: '#1a8c1a',
		shadow: 'rgba(0, 0, 0, 0.15)',
		focusRing: 'rgba(74, 144, 217, 0.2)',
	},
	codeBlock: {
		background: '#f8fafc',
		foreground: '#334155',
		headerBackground: '#f1f5f9',
		headerForeground: '#64748b',
		headerBorder: '#e2e8f0',
	},
	tooltip: {
		background: '#1a1a1a',
		foreground: '#ffffff',
	},
};

/** Built-in dark theme. */
export const DARK_THEME: Theme = {
	name: 'dark',
	primitives: {
		background: '#1e1e2e',
		foreground: '#cdd6f4',
		mutedForeground: '#7f849c',
		border: '#45475a',
		borderFocus: '#89b4fa',
		primary: '#89b4fa',
		primaryForeground: '#89b4fa',
		primaryMuted: 'rgba(137, 180, 250, 0.15)',
		surfaceRaised: '#313244',
		surfaceOverlay: '#313244',
		hoverBackground: '#45475a',
		activeBackground: 'rgba(137, 180, 250, 0.15)',
		danger: '#f38ba8',
		dangerMuted: 'rgba(243, 139, 168, 0.15)',
		success: '#a6e3a1',
		shadow: 'rgba(0, 0, 0, 0.4)',
		focusRing: 'rgba(137, 180, 250, 0.25)',
	},
	codeBlock: {
		background: '#11111b',
		foreground: '#cdd6f4',
		headerBackground: '#181825',
		headerForeground: '#7f849c',
		headerBorder: 'rgba(205, 214, 244, 0.08)',
	},
	tooltip: {
		background: '#585b70',
		foreground: '#cdd6f4',
	},
};

/** Creates a custom theme by extending a base theme with partial overrides. */
export function createTheme(base: Theme, overrides: PartialTheme): Theme {
	return {
		name: overrides.name,
		primitives: { ...base.primitives, ...overrides.primitives },
		toolbar: overrides.toolbar ? { ...base.toolbar, ...overrides.toolbar } : base.toolbar,
		codeBlock: overrides.codeBlock ? { ...base.codeBlock, ...overrides.codeBlock } : base.codeBlock,
		tooltip: overrides.tooltip ? { ...base.tooltip, ...overrides.tooltip } : base.tooltip,
	};
}

/** Resolves a ThemePreset string or Theme object to a full Theme. */
export function resolveTheme(theme: ThemePreset | Theme): Theme {
	if (typeof theme === 'object') return theme;
	switch (theme) {
		case ThemePreset.Light:
			return LIGHT_THEME;
		case ThemePreset.Dark:
			return DARK_THEME;
		case ThemePreset.System:
			// System is resolved externally via matchMedia; default to light.
			return LIGHT_THEME;
		default:
			return LIGHT_THEME;
	}
}
