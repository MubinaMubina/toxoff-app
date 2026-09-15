import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

// Public pages on the toxoff website (sources in docs/, hosted at toxoff.app). Meta's app
// settings and App Store Connect point to the same links.
const SITE = 'https://toxoff.app';
export const PRIVACY_URL = `${SITE}/privacy.html`;
export const TERMS_URL = `${SITE}/terms.html`;
export const DELETE_DATA_URL = `${SITE}/delete-account.html`;
export const SUPPORT_URL = `${SITE}/support.html`;
export const SUPPORT_EMAIL = 'support@toxoff.app';

export const openLink = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
export const emailSupport = () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=toxoff%20help`);
