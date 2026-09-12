import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { detectRegion, regionByCode, REGIONS } from '../data/pricing';
import { Region } from '../types';

type RegionValue = {
  region: Region;
  /** true when the user manually overrode the auto-detected region */
  overridden: boolean;
  setRegionCode: (code: string) => void;
  /** Asks the user to pick a region from a list; the same picker everywhere region changes. */
  chooseRegion: (onChosen?: (region: Region) => void) => void;
  available: Region[];
};

const STORAGE_KEY = 'toxoff.regionCode';
const RegionContext = createContext<RegionValue | undefined>(undefined);

export function RegionProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegion] = useState<Region>(() => detectRegion());
  const [overridden, setOverridden] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((code) => {
      if (code && REGIONS[code]) {
        setRegion(regionByCode(code));
        setOverridden(true);
      }
    });
  }, []);

  const setRegionCode = (code: string) => {
    setRegion(regionByCode(code));
    setOverridden(true);
    AsyncStorage.setItem(STORAGE_KEY, code.toUpperCase()).catch(() => {});
  };

  const chooseRegion = (onChosen?: (region: Region) => void) =>
    Alert.alert('Billing region', 'Pick the region used for pricing and payment methods.', [
      ...Object.values(REGIONS).map((r) => ({
        text: `${r.country} (${r.currency})`,
        onPress: () => {
          setRegionCode(r.code);
          onChosen?.(r);
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const value = useMemo<RegionValue>(
    () => ({ region, overridden, setRegionCode, chooseRegion, available: Object.values(REGIONS) }),
    [region, overridden]
  );

  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error('useRegion must be used within RegionProvider');
  return ctx;
}
