import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

// Public pages (sources in legal/, hosted in the Supabase project's public "legal" bucket until
// toxoff has its own website). Meta's app settings and App Store Connect point to the same links.
const LEGAL = 'https://sjfmcieunormozrybqmi.supabase.co/storage/v1/object/public/legal';
export const PRIVACY_URL = `${LEGAL}/privacy.txt`;
export const TERMS_URL = `${LEGAL}/terms.txt`;
export const DELETE_DATA_URL = `${LEGAL}/delete-data.txt`;
export const SUPPORT_EMAIL = 'support@toxoff.app';

export const openLink = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
export const emailSupport = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=toxoff%20help`);
