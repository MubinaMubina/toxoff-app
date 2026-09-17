// Shared visual language with the live toxoff.app: warm paper, sage, forest ink,
// lavender notes, and Manrope. Brand colors identify actions and selections;
// semantic colors communicate state. Always pair a semantic foreground with its fill.

export const palette = {
  forest: '#173F35',
  forestDeep: '#123329',
  forestMid: '#285A46',
  forestLight: '#52754B',
  mint: '#D1E9C2',
  mintLight: '#E0EFD7',
  forestSoft: '#EDF5E9',
  forestSoftDark: '#253A2C',
  lavender: '#E4DDF5',

  green: '#16734B',
  greenSoft: '#E6F5EC',
  red: '#B3343A',
  redSoft: '#FDEBEC',
  amber: '#915A12',
  amberSoft: '#FFF3DC',
  blue: '#365F91',

  white: '#FFFFFF',
  black: '#0A0F0D',
};

export type ColorScheme = {
  background: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primarySoft: string;
  onPrimary: string;
  success: string;
  successSoft: string;
  successBorder: string;
  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  warning: string;
  warningSoft: string;
  warningBorder: string;
  info: string;
  infoSoft: string;
  infoBorder: string;
  neutral: string;
  neutralSoft: string;
  neutralBorder: string;
  switchOn: string;
  switchOff: string;
  switchThumb: string;
  overlay: string;
  tabInactive: string;
  hero: string;
  accentSoft: string;
  accentText: string;
  accentBorder: string;
  filtered: string;
  filteredBorder: string;
};

export const lightColors: ColorScheme = {
  background: '#FAFBF7',
  surface: '#FFFEFB',
  surfaceAlt: '#F0F3EF',
  card: '#FFFEFB',
  border: '#D1D9D0',
  text: '#173F35',
  textMuted: '#526058',
  textFaint: '#596760',
  primary: palette.forest,
  primaryDark: palette.forest,
  primaryLight: palette.forestLight,
  primarySoft: palette.forestSoft,
  onPrimary: '#FFFFFF',
  success: palette.green,
  successSoft: palette.greenSoft,
  successBorder: '#B8DEC7',
  danger: palette.red,
  dangerSoft: palette.redSoft,
  dangerBorder: '#EDC0C3',
  warning: palette.amber,
  warningSoft: palette.amberSoft,
  warningBorder: '#E7CEA3',
  info: palette.blue,
  infoSoft: '#EAF1FA',
  infoBorder: '#C4D5EB',
  neutral: '#58636C',
  neutralSoft: '#EEF1F3',
  neutralBorder: '#D1D8DD',
  // Switch tracks must contrast with both the white thumb and the page surface.
  switchOn: '#218557',
  switchOff: '#7B8580',
  switchThumb: palette.white,
  overlay: 'rgba(10,15,13,0.45)',
  tabInactive: '#58636C',
  hero: '#EDF5E9',
  accentSoft: palette.lavender,
  accentText: '#524270',
  accentBorder: '#C8B9DF',
  filtered: '#EEF1F3',
  filteredBorder: '#D1D8DD',
};

export const darkColors: ColorScheme = {
  background: '#111C16',
  surface: '#1A281E',
  surfaceAlt: '#29372B',
  card: '#1C2B21',
  border: '#40503B',
  text: '#EEF4E8',
  textMuted: '#B8C4BE',
  textFaint: '#A6B3AC',
  primary: palette.mint,
  primaryDark: palette.forestLight,
  primaryLight: palette.mintLight,
  primarySoft: palette.forestSoftDark,
  onPrimary: '#173F35',
  success: '#79D5A4',
  successSoft: '#173B2A',
  successBorder: '#356449',
  danger: '#FF9DA1',
  dangerSoft: '#442326',
  dangerBorder: '#794349',
  warning: '#F2BE68',
  warningSoft: '#3B2E19',
  warningBorder: '#705630',
  info: '#A2C5F2',
  infoSoft: '#223348',
  infoBorder: '#425F80',
  neutral: '#BBC4CB',
  neutralSoft: '#2B3339',
  neutralBorder: '#4B565F',
  switchOn: '#22885A',
  switchOff: '#6F7C74',
  switchThumb: palette.white,
  overlay: 'rgba(0,0,0,0.6)',
  tabInactive: '#AAB4BC',
  hero: '#253A2C',
  accentSoft: '#352D45',
  accentText: '#E4DDF5',
  accentBorder: '#645578',
  filtered: '#2B3339',
  filteredBorder: '#4B565F',
};

export type SemanticTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type BadgeTone = SemanticTone | 'brand' | 'accent';

/** One foreground/fill/border contract for badges, notices, and state indicators. */
export function getSemanticColors(colors: ColorScheme, tone: BadgeTone) {
  if (tone === 'brand') return { text: colors.primary, background: colors.primarySoft, border: colors.border };
  if (tone === 'accent') return { text: colors.accentText, background: colors.accentSoft, border: colors.accentBorder };
  return { text: colors[tone], background: colors[`${tone}Soft`], border: colors[`${tone}Border`] };
}

export const radius = { sm: 6, md: 8, lg: 14, xl: 20, pill: 999 };
// gutter: the side margin of every screen, so content keeps one left edge app-wide.
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24, xxl: 32 };
export const font = {
  size: { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 28, huge: 34 },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
};
