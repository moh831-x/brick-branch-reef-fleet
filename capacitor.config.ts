import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Folio by Zip1 — iOS app shell (Capacitor).
 *
 * The app loads the live site (server routes like /api/search and the Bing
 * fetch run on Vercel), so there is no static web build to bundle. `webDir`
 * only holds the offline fallback page shipped inside the app.
 *
 * APP_ID must match the bundle identifier registered in App Store Connect.
 * If you change it, also change "Bundle Identifier" in Xcode
 * (App target > Signing & Capabilities); `cap sync` does not rewrite it.
 */
const APP_ID = "ai.zip1.folio";
const SITE_URL = "https://www.zip1.ai";
const BG = "#f3efe6";

const config: CapacitorConfig = {
  appId: APP_ID,
  appName: "Folio by Zip1",
  webDir: "native-shell",
  server: {
    url: SITE_URL,
    // Only Folio's own hosts load inside the app. Every other link is opened
    // in the in-app browser (SFSafariViewController) by src/lib/native.ts.
    allowNavigation: ["zip1.ai", "www.zip1.ai"],
    // Bundled page shown when the site cannot be reached (offline, DNS, timeout).
    errorPath: "offline.html",
  },
  ios: {
    backgroundColor: BG,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: BG,
      showSpinner: false,
    },
    StatusBar: {
      // "LIGHT" = dark text, for Folio's light paper background.
      style: "LIGHT",
    },
  },
};

export default config;
