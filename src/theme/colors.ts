// toxoff design tokens. Deep forest green primary, taken from the app icon (assets/icon.png:
// a white outlined speech bubble with a check, a pale lavender bubble behind it, on #13433B).
// Clean/minimal, light + dark. Neutrals carry a faint green cast so cards sit naturally with it.

export const palette = {
  forest: '#13433B', // the icon's background: brand colour, splash, notification tint
  forestDeep: '#0D2F2A',
  forestMid: '#14574B', // light-mode primary: reads as green, not near-black, on white
  forestLight: '#2E8C78',
  mint: '#4CBFA6', // dark-mode primary: enough luminance on near-black
  mintLight: '#6FD3BE',
  forestSoft: '#E4F1EC',
  forestSoftDark: '#15312B',
  lavender: '#E0E0F8', // the icon's rear bubble; a quiet second accent

  green: '#22A06B',
  greenSoft: '#E4F6EE',
  red: '#E5484D',
  redSoft: '#FDECEC',
  amber: '#E9A23B',
  amberSoft: '#FBF1E0',
  blue: '#3B82F6',

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
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  overlay: string;
  tabInactive: string;
};

export const lightColors: ColorScheme = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F7F5',
  card: '#FFFFFF',
  border: '#E6ECE9',
  text: '#15201C',
  textMuted: '#66736E',
  textFaint: '#66736E', // secondary information remains readable on white
  primary: palette.forestMid,
  primaryDark: palette.forest,
  primaryLight: palette.forestLight,
  primarySoft: palette.forestSoft,
  onPrimary: '#FFFFFF',
  success: palette.green,
  successSoft: palette.greenSoft,
  danger: palette.red,
  dangerSoft: palette.redSoft,
  warning: palette.amber,
  warningSoft: palette.amberSoft,
  overlay: 'rgba(10,15,13,0.45)',
  tabInactive: '#66736E',
};

export const darkColors: ColorScheme = {
  background: '#0C1210',
  surface: '#121A17',
  surfaceAlt: '#182220',
  card: '#151E1B',
  border: '#25312D',
  text: '#F2F6F4',
  textMuted: '#98A6A1',
  textFaint: '#98A6A1', // timestamps and status copy meet normal-text contrast
  primary: palette.mint,
  primaryDark: palette.forestLight,
  primaryLight: palette.mintLight,
  primarySoft: palette.forestSoftDark,
  onPrimary: '#0C1210',
  success: '#34C98A',
  successSoft: '#13301F',
  danger: '#F26A6E',
  dangerSoft: '#3A1B1C',
  warning: '#F0B45E',
  warningSoft: '#352915',
  overlay: 'rgba(0,0,0,0.6)',
  tabInactive: '#98A6A1',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
// gutter: the side margin of every screen, so content keeps one left edge app-wide.
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, gutter: 20, xl: 24, xxl: 32 };
export const font = {
  size: { xs: 12, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26, huge: 34 },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
};
