// toxoff design tokens. Soft purple primary (#534AB7), clean/minimal, light + dark.

export const palette = {
  purple: '#534AB7',
  purpleDark: '#433CA0',
  purpleLight: '#6F66D6',
  purpleSoft: '#EEEDFB',
  purpleSoftDark: '#26233F',

  green: '#22A06B',
  greenSoft: '#E4F6EE',
  red: '#E5484D',
  redSoft: '#FDECEC',
  amber: '#E9A23B',
  amberSoft: '#FBF1E0',
  blue: '#3B82F6',

  white: '#FFFFFF',
  black: '#0A0A0F',
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
  surfaceAlt: '#F6F6FA',
  card: '#FFFFFF',
  border: '#ECECF2',
  text: '#16161D',
  textMuted: '#6A6A78',
  textFaint: '#A0A0AE',
  primary: palette.purple,
  primaryDark: palette.purpleDark,
  primaryLight: palette.purpleLight,
  primarySoft: palette.purpleSoft,
  onPrimary: '#FFFFFF',
  success: palette.green,
  successSoft: palette.greenSoft,
  danger: palette.red,
  dangerSoft: palette.redSoft,
  warning: palette.amber,
  warningSoft: palette.amberSoft,
  overlay: 'rgba(10,10,15,0.45)',
  tabInactive: '#A0A0AE',
};

export const darkColors: ColorScheme = {
  background: '#0E0E14',
  surface: '#15151D',
  surfaceAlt: '#1B1B25',
  card: '#191921',
  border: '#282834',
  text: '#F4F4F8',
  textMuted: '#9A9AAC',
  textFaint: '#62626F',
  primary: palette.purpleLight,
  primaryDark: palette.purple,
  primaryLight: '#857CE6',
  primarySoft: palette.purpleSoftDark,
  onPrimary: '#FFFFFF',
  success: '#34C98A',
  successSoft: '#13301F',
  danger: '#F26A6E',
  dangerSoft: '#3A1B1C',
  warning: '#F0B45E',
  warningSoft: '#352915',
  overlay: 'rgba(0,0,0,0.6)',
  tabInactive: '#62626F',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
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
