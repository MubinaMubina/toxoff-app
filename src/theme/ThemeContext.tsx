import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemScheme } from 'react-native';
import {
  ColorScheme,
  darkColors,
  font,
  lightColors,
  radius,
  spacing,
} from './colors';

type ThemePref = 'system' | 'light' | 'dark';

type ThemeValue = {
  colors: ColorScheme;
  isDark: boolean;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  radius: typeof radius;
  spacing: typeof spacing;
  font: typeof font;
};

const STORAGE_KEY = 'toxoff.themePref';
const ThemeContext = createContext<ThemeValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useSystemScheme();
  // Follows the phone's light or dark setting until the user picks one in Settings.
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPrefState(v);
    });
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  };

  const isDark = pref === 'system' ? system === 'dark' : pref === 'dark';

  const value = useMemo<ThemeValue>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark,
      pref,
      setPref,
      radius,
      spacing,
      font,
    }),
    [isDark, pref]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
