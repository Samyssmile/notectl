/**
 * Image plugin types, configuration, and service key.
 */

import { ServiceKey } from '../Plugin.js';

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

// --- Configuration ---

export interface ImagePluginConfig {
	readonly maxWidth: number;
	readonly maxFileSize: number;
	readonly acceptedTypes: readonly string[];
	readonly resizable: boolean;
	readonly separatorAfter?: boolean;
}

export const DEFAULT_IMAGE_CONFIG: ImagePluginConfig = {
	maxWidth: 800,
	maxFileSize: 10 * 1024 * 1024,
	acceptedTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
	resizable: true,
};
