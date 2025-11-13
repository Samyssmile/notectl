export type FontFormat = 'woff2' | 'woff' | 'ttf' | 'otf';

export interface FontSource {
  src: string;
  format: FontFormat;
}

export interface FontVariantDefinition {
  style?: string;
  weight?: string | number;
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  stretch?: string;
  unicodeRange?: string;
  sources: FontSource[];
}

export interface FontDefinition {
  family: string;
  label?: string;
  fallbacks?: string[];
  variants: FontVariantDefinition[];
}

export interface FontManifest {
  basePath?: string;
  fonts: FontDefinition[];
}

export type FontConfigInput = FontManifest | FontDefinition[];

export interface RegisteredFontSummary {
  family: string;
  label: string;
}
