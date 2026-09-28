import {
  CN_BROWSER_PATTERNS,
  CN_DEVICE_PATTERNS,
  CN_TIMEZONES,
  FONTS_CN_VENDOR,
  FONTS_SC,
  FONTS_TC,
} from './device-patterns.ts';

type BrowserNavigator = Navigator & {
  userAgentData?: {
    brands: { brand: string; version: string }[];
    getHighEntropyValues(hints: string[]): Promise<Record<string, unknown>>;
  };
};

const FONT_SAMPLE = '字体辨识 AaMm0123456789';
const FONT_BASES = ['monospace', 'serif', 'sans-serif'] as const;
const EMOJI_SET = ['🇨🇳', '🇹🇼', '🇺🇸', '😀'] as const;
const MODEL_HINT_TIMEOUT = 1000;

export function matchEnvironment(
  userAgent: string,
  timezone: string,
  languages: readonly string[]
) {
  const hitsOf = (list: readonly (readonly [RegExp, string, ...unknown[]])[]) =>
    list.filter(([pattern]) => pattern.test(userAgent)).map(([, name]) => name);
  const chineseLanguages = languages.filter((value) => /^zh(?:-|$)/i.test(value));
  return {
    timezoneMatch: CN_TIMEZONES.includes(timezone),
    chineseLanguages,
    browsers: hitsOf(CN_BROWSER_PATTERNS),
    devices: hitsOf(CN_DEVICE_PATTERNS),
  };
}

export function probeFonts(
  ctx: Pick<CanvasRenderingContext2D, 'font' | 'measureText'>,
  fonts: string[]
) {
  const widthWith = (font: string) => {
    ctx.font = `72px ${font}`;
    return ctx.measureText(FONT_SAMPLE).width;
  };
  return fonts.filter((font) =>
    FONT_BASES.some((base) => {
      const baseWidth = widthWith(base);
      const candidateWidth = widthWith(`"${font}", ${base}`);
      return Math.abs(candidateWidth - baseWidth) > 0.5;
    })
  );
}

export function pixelSummary(pixels: Uint8ClampedArray) {
  let visible = 0;
  let colored = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 32) continue;
    visible += 1;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 20) colored += 1;
  }
  const kind = !visible ? 'empty' : colored > 0 ? 'color' : 'monochrome';
  return { visible, colored, kind } as const;
}

function renderEmoji(emoji: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 80;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.font = '48px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText(emoji, 4, 55);
  return { emoji, ...pixelSummary(ctx.getImageData(0, 0, 128, 80).data) };
}

function readModel(nav: BrowserNavigator) {
  const hints = nav.userAgentData?.getHighEntropyValues;
  if (!hints) return Promise.resolve(undefined);
  const deadline = new Promise<undefined>((resolve) => {
    setTimeout(() => resolve(undefined), MODEL_HINT_TIMEOUT);
  });
  return Promise.race([hints.call(nav.userAgentData, ['model']), deadline])
    .then((high) => (typeof high?.model === 'string' ? high.model : undefined))
    .catch(() => undefined);
}

function readFonts() {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return undefined;
    return {
      simplified: probeFonts(ctx, FONTS_SC),
      traditional: probeFonts(ctx, FONTS_TC),
      vendor: probeFonts(ctx, FONTS_CN_VENDOR),
    };
  } catch {
    /* Canvas may be blocked. Do not report a clean result. */
    return undefined;
  }
}

function readEmojis() {
  try {
    return EMOJI_SET.map(renderEmoji);
  } catch {
    /* Canvas readback may be blocked. */
    return undefined;
  }
}

export async function collectDeviceSignals(signal: AbortSignal) {
  signal.throwIfAborted();
  const nav = navigator as BrowserNavigator;
  const model = await readModel(nav);
  signal.throwIfAborted();

  const intl = Intl.DateTimeFormat().resolvedOptions();
  const languages = Array.from(nav.languages.length ? nav.languages : [nav.language]);
  const brandText = (nav.userAgentData?.brands ?? []).map((item) => item.brand).join(' ');

  return {
    timezone: intl.timeZone,
    languages,
    model,
    fonts: readFonts(),
    emojis: readEmojis(),
    offset: -new Date().getTimezoneOffset(),
    dateLocale: intl.locale,
    numberLocale: Intl.NumberFormat().resolvedOptions().locale,
    ...matchEnvironment(`${nav.userAgent} ${brandText} ${model ?? ''}`, intl.timeZone, languages),
  };
}
