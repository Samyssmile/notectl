/**
 * Image plugin types, configuration, and service key.
 */

import { ServiceKey } from '../Plugin.js';
import type { ImageLocale } from './ImageLocale.js';

// --- Image Attributes ---

export interface ImageAttrs {
	readonly src: string;
	readonly alt: string;
	readonly width?: number;
	readonly height?: number;
	readonly align: 'left' | 'center' | 'right';
}

// --- Upload Types ---

export interface ImageUploadResult {
	readonly url: string;
	readonly width?: number;
	readonly height?: number;
}

export interface ImageUploadService {
	upload(file: File): Promise<ImageUploadResult>;
}

export const IMAGE_UPLOAD_SERVICE = new ServiceKey<ImageUploadService>('image:upload');

export type UploadState = 'idle' | 'uploading' | 'complete' | 'error';

// --- Keyboard Bindings ---

/**
 * Configurable keyboard bindings for image resize actions.
 * Omit a slot to use the default; set to `null` to disable the binding.
 *
 * Key descriptor format: `'Mod-Shift-ArrowRight'`, etc.
 * `Mod` resolves to Cmd on macOS, Ctrl on Windows/Linux.
 */
export interface ImageKeymap {
	readonly growWidth?: string | null;
	readonly shrinkWidth?: string | null;
	readonly growWidthLarge?: string | null;
	readonly shrinkWidthLarge?: string | null;
	readonly resetSize?: string | null;
}

export const DEFAULT_IMAGE_KEYMAP: Readonly<Record<keyof ImageKeymap, string>> = {
	growWidth: 'Mod-Shift-ArrowRight',
	shrinkWidth: 'Mod-Shift-ArrowLeft',
	growWidthLarge: 'Mod-Shift-Alt-ArrowRight',
	shrinkWidthLarge: 'Mod-Shift-Alt-ArrowLeft',
	resetSize: 'Mod-Shift-0',
};

// --- Configuration ---

export interface ImagePluginConfig {
	readonly maxWidth: number;
	readonly maxFileSize: number;
	readonly acceptedTypes: readonly string[];
	readonly resizable: boolean;
	readonly separatorAfter?: boolean;
	/** Pixels to grow/shrink per small resize step. @default 10 */
	readonly resizeStep?: number;
	/** Pixels to grow/shrink per large resize step. @default 50 */
	readonly resizeStepLarge?: number;
	/** Customize keyboard bindings for image resize actions. */
	readonly keymap?: ImageKeymap;
	/** Locale override for user-facing strings. */
	readonly locale?: ImageLocale;
}

export const DEFAULT_IMAGE_CONFIG: ImagePluginConfig = {
	maxWidth: 800,
	maxFileSize: 10 * 1024 * 1024,
	acceptedTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
	resizable: true,
	resizeStep: 10,
	resizeStepLarge: 50,
};
