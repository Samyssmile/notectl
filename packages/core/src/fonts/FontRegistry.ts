import type {
  FontConfigInput,
  FontDefinition,
  FontManifest,
  FontSource,
  FontVariantDefinition,
  RegisteredFontSummary,
} from './types.js';
import type { FontFormat } from './types.js';

const SUPPORTED_FORMATS: Record<FontFormat, string> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

function isManifest(config: FontConfigInput): config is FontManifest {
  return !Array.isArray(config) && typeof config === 'object' && 'fonts' in config;
}

function normalizeManifest(config?: FontConfigInput): FontManifest | undefined {
  if (!config) {
    return undefined;
  }

  if (isManifest(config)) {
    return config;
  }

  return { fonts: config };
}

export class FontRegistry {
  private static instance: FontRegistry;

  private styleElement?: HTMLStyleElement;
  private registeredVariants = new Set<string>();
  private registeredFonts = new Map<string, string>();

  private constructor() {}

  static getInstance(): FontRegistry {
    if (!FontRegistry.instance) {
      FontRegistry.instance = new FontRegistry();
    }
    return FontRegistry.instance;
  }

  register(config?: FontConfigInput): void {
    const manifest = normalizeManifest(config);
    if (!manifest) {
      return;
    }

    const basePath = manifest.basePath;
    manifest.fonts.forEach((font) => {
      this.registerFont(font, basePath);
    });
  }

  getRegisteredFonts(): RegisteredFontSummary[] {
    return Array.from(this.registeredFonts.entries()).map(([family, label]) => ({ family, label }));
  }

  private registerFont(font: FontDefinition, basePath?: string): void {
    if (!font || !Array.isArray(font.variants)) {
      return;
    }

    if (font.family && !this.registeredFonts.has(font.family)) {
      this.registeredFonts.set(font.family, font.label || font.family);
    }

    font.variants.forEach((variant) => {
      const rule = this.createFontFaceRule(font, variant, basePath);
      if (!rule) {
        return;
      }

      const signature = this.createVariantSignature(font.family, variant, rule);
      if (this.registeredVariants.has(signature)) {
        return;
      }

      this.injectRule(rule);
      this.registeredVariants.add(signature);
    });
  }

  private createVariantSignature(family: string, variant: FontVariantDefinition, rule: string): string {
    return [family, variant.style ?? 'normal', variant.weight ?? 'normal', rule].join(':');
  }

  private createFontFaceRule(
    font: FontDefinition,
    variant: FontVariantDefinition,
    basePath?: string
  ): string | null {
    if (!variant.sources || variant.sources.length === 0) {
      return null;
    }

    const sourceSegments = variant.sources
      .map((source) => this.createSourceSegment(source, basePath))
      .filter((segment): segment is string => Boolean(segment));

    if (sourceSegments.length === 0) {
      return null;
    }

    const lines: string[] = [
      `@font-face {`,
      `  font-family: '${font.family}';`,
      `  font-style: ${variant.style ?? 'normal'};`,
      `  font-weight: ${variant.weight ?? 'normal'};`,
      `  font-display: ${variant.display ?? 'swap'};`,
    ];

    if (variant.stretch) {
      lines.push(`  font-stretch: ${variant.stretch};`);
    }

    if (variant.unicodeRange) {
      lines.push(`  unicode-range: ${variant.unicodeRange};`);
    }

    lines.push(`  src: ${sourceSegments.join(',\n       ')};`);
    lines.push('}');

    return lines.join('\n');
  }

  private createSourceSegment(source: FontSource, basePath?: string): string | null {
    if (!SUPPORTED_FORMATS[source.format]) {
      console.warn(`Unsupported font format: ${source.format}`);
      return null;
    }

    const url = this.resolveSourceUrl(source.src, basePath);
    return `url('${url}') format('${SUPPORTED_FORMATS[source.format]}')`;
  }

  private resolveSourceUrl(src: string, basePath?: string): string {
    if (/^(https?:|data:|blob:)/.test(src)) {
      return src;
    }

    if (src.startsWith('/')) {
      return src;
    }

    if (basePath) {
      return `${basePath.replace(/\/$/, '')}/${src.replace(/^\//, '')}`;
    }

    return src;
  }

  private injectRule(rule: string): void {
    if (typeof document === 'undefined') {
      return;
    }

    const styleElement = this.ensureStyleElement();
    styleElement.appendChild(document.createTextNode(`${rule}\n`));
  }

  private ensureStyleElement(): HTMLStyleElement {
    if (this.styleElement && this.styleElement.ownerDocument) {
      return this.styleElement;
    }

    const doc = document;
    const existing = doc.querySelector<HTMLStyleElement>('style[data-notectl-fonts]');
    if (existing) {
      this.styleElement = existing;
      return existing;
    }

    const style = doc.createElement('style');
    style.setAttribute('data-notectl-fonts', 'true');
    doc.head.appendChild(style);
    this.styleElement = style;
    return style;
  }
}

export const fontRegistry = FontRegistry.getInstance();

export function registerFonts(config?: FontConfigInput): void {
  fontRegistry.register(config);
}
