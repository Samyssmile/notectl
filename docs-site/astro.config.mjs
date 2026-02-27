// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://samyssmile.github.io',
	base: '/notectl',
	integrations: [
		starlight({
			title: 'notectl',
			logo: {
				light: './src/assets/logo-light.svg',
				dark: './src/assets/logo-dark.svg',
				replacesTitle: false,
			},
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/samyssmile/notectl',
				},
			],
			customCss: ['./src/styles/custom.css'],
			editLink: {
				baseUrl: 'https://github.com/samyssmile/notectl/edit/main/docs-site/',
			},
			head: [
				{
					tag: 'meta',
					attrs: {
						property: 'og:image',
						content: '/notectl/og-image.png',
					},
				},
			],
			sidebar: [
				{
					label: 'Playground',
					slug: 'playground',
				},
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Plugin Presets', slug: 'guides/presets' },
					{ label: 'Toolbar Configuration', slug: 'guides/toolbar' },
						{ label: 'Custom Fonts', slug: 'guides/custom-fonts' },
						{ label: 'Theming', slug: 'guides/styling' },
						{ label: 'Working with Content', slug: 'guides/content' },
						{ label: 'Events & Lifecycle', slug: 'guides/events' },
						{ label: 'Paper Size', slug: 'guides/paper-size' },
						{ label: 'Read-Only Checklist', slug: 'guides/readonly-checklist' },
						{ label: 'Internationalization', slug: 'guides/internationalization' },
						{ label: 'Angular Integration', slug: 'guides/angular' },
						{ label: 'Writing a Plugin', slug: 'guides/writing-plugins' },
						{ label: 'Keyboard Navigation', slug: 'guides/keyboard-navigation' },
						{ label: 'Content Security Policy', slug: 'guides/content-security-policy' },
					],
				},
				{
					label: 'Plugins',
					items: [
						{ label: 'Overview', slug: 'plugins/overview' },
						{ label: 'Text Formatting', slug: 'plugins/text-formatting' },
						{ label: 'Heading', slug: 'plugins/heading' },
						{ label: 'List', slug: 'plugins/list' },
						{ label: 'Link', slug: 'plugins/link' },
						{ label: 'Table', slug: 'plugins/table' },
					{ label: 'Code Block', slug: 'plugins/code-block' },
						{ label: 'Blockquote', slug: 'plugins/blockquote' },
						{ label: 'Image', slug: 'plugins/image' },
						{ label: 'Font', slug: 'plugins/font' },
						{ label: 'Font Size', slug: 'plugins/font-size' },
						{ label: 'Text Color', slug: 'plugins/text-color' },
						{ label: 'Alignment', slug: 'plugins/alignment' },
						{ label: 'Strikethrough', slug: 'plugins/strikethrough' },
						{ label: 'Superscript & Subscript', slug: 'plugins/super-sub' },
						{ label: 'Highlight', slug: 'plugins/highlight' },
						{ label: 'Horizontal Rule', slug: 'plugins/horizontal-rule' },
						{ label: 'Hard Break', slug: 'plugins/hard-break' },
						{ label: 'Print', slug: 'plugins/print' },
						{ label: 'Toolbar', slug: 'plugins/toolbar' },
						{ label: 'Caret Navigation', slug: 'plugins/caret-navigation' },
						{ label: 'Gap Cursor', slug: 'plugins/gap-cursor' },
					],
				},
				{
					label: 'API Reference',
					items: [
						{ label: 'NotectlEditor', slug: 'api/editor' },
						{ label: 'EditorState', slug: 'api/editor-state' },
						{ label: 'Transaction', slug: 'api/transaction' },
						{ label: 'Document Model', slug: 'api/document-model' },
						{ label: 'Plugin Interface', slug: 'api/plugin-interface' },
						{ label: 'Selection', slug: 'api/selection' },
						{ label: 'Decorations', slug: 'api/decorations' },
						{ label: 'Popup Framework', slug: 'api/popup-framework' },
					],
				},
				{
					label: 'Architecture',
					items: [
						{ label: 'Overview', slug: 'architecture/overview' },
						{ label: 'Data Flow', slug: 'architecture/data-flow' },
					],
				},
			],
		}),
	],
});
