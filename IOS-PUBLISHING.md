# Folio by Zip1 — iOS app (Capacitor) and App Store publishing

The iOS app is a native Capacitor shell around the live site, **https://www.zip1.ai**.
Folio depends on server routes (`/api/search`, the Bing fetch, previews, suggestions)
that run on Vercel, so the app loads the deployed site instead of bundling a static
export. Deploying the website updates the app's content; you only need a new App
Store build when native code, config, icons or plugins change.

| Setting | Value | Where |
| --- | --- | --- |
| App name (home screen) | Folio by Zip1 | `capacitor.config.ts` `appName`, Info.plist `CFBundleDisplayName` |
| Bundle ID | `ai.zip1.folio` | `capacitor.config.ts` `APP_ID` **and** Xcode › App target › Signing & Capabilities |
| Site loaded | `https://www.zip1.ai` | `capacitor.config.ts` `server.url` |
| Hosts allowed in the web view | `zip1.ai`, `www.zip1.ai` | `server.allowNavigation` |
| Offline page (bundled) | `native-shell/offline.html` | `server.errorPath` |
| Minimum iOS | 15.0 | Xcode project + `CapApp-SPM/Package.swift` |
| Devices | iPhone only (runs on iPad in compatibility mode) | `TARGETED_DEVICE_FAMILY = 1` |
| Version / build | 1.0 (1) | Xcode › App target › General |

> The bundle ID must exactly match the App ID you register in the Apple Developer
> portal and pick in App Store Connect. To change it, edit `APP_ID` in
> `capacitor.config.ts` and the **Bundle Identifier** in Xcode (`cap sync` does not
> rewrite the Xcode project).

## What the app adds over the website

All native behaviour is gated on `Capacitor.isNativePlatform()` (see `src/lib/native.ts`).
In a normal browser none of it runs, no plugin code is downloaded, and the site looks
and behaves exactly as before.

- **Native share sheet** (`@capacitor/share`): a Share button next to the results
  summary (shares the Folio search link) and in the result preview sheet (shares the
  result page). Only rendered inside the app.
- **Haptics** (`@capacitor/haptics`): taps on search submit, source toggles
  (selection tick), opening a result preview, pagination, share and outbound links.
- **In-app browser** (`@capacitor/browser`): every off-site link (result arrows that
  open a new tab on the web, "Open page", "View full-size image", references,
  Wikipedia cards, place and map links, the ad) opens in an SFSafariViewController over the app instead of taking the
  web view away from Folio. Folio's own pages stay in the app.
- **Status bar and launch screen** (`@capacitor/status-bar`, `@capacitor/splash-screen`):
  dark status-bar text on Folio's paper background; branded launch screen that fades
  out once the page is up.
- **Offline screen**: if www.zip1.ai can't be reached, the app shows a bundled
  "You're offline" page with a Try again button that also reconnects automatically when
  the network returns.
- App icon and launch image generated from the site's Folio mark (`public/favicon.svg`).

Deferred: a native "Save to Photos" button for Images results. There is no official
Capacitor plugin for saving to Photos, so it needs a community plugin (or a few lines
of Swift) plus an `NSPhotoLibraryAddUsageDescription` string in Info.plist. Today "View full-size image" opens in the in-app browser, where
the user can long-press to save. Push notifications, widgets and
Spotlight/Siri shortcuts are further options if Apple asks for more native value.

## Files

```
capacitor.config.ts          app id, name, server.url, allowNavigation, errorPath, plugin config
native-shell/                bundled web assets: offline.html (+ index.html fallback)
ios/                         Xcode project (Swift Package Manager, no CocoaPods)
  App/App.xcodeproj          open this in Xcode
  App/CapApp-SPM/            SPM package that pulls Capacitor + plugins from node_modules
  App/App/Info.plist
  App/App/PrivacyInfo.xcprivacy
  App/App/Assets.xcassets    AppIcon (1024×1024, opaque) and Splash images
assets/ios/icon.svg          icon source; regenerate with scripts/ios-assets.mjs
src/lib/native.ts            native helpers (share, haptics, in-app browser, shell setup)
src/components/native-shell.tsx  mounts the native setup in the root route
```

Regenerate icons/splash after changing the logo:

```sh
npm i --no-save sharp && node scripts/ios-assets.mjs
```

## Build and upload on the Mac

Prerequisites: macOS with the **current Xcode** from the Mac App Store (App Store
Connect rejects uploads built with an outdated SDK), Node.js **22+** (required by the
Capacitor 8 CLI), git, and an Apple Developer Program membership. CocoaPods is **not**
needed; the project uses Swift Package Manager.

1. Get the code and install dependencies:
   ```sh
   git clone https://github.com/moh831-x/sky-yonder-honey-urban.git
   cd sky-yonder-honey-urban
   git checkout feature/ios-app   # or main after this PR is merged
   npm install                    # installs dev deps too (@capacitor/cli, @capacitor/ios)
   ```
2. Sync the native project (copies the offline page and config into the app, and
   refreshes the SPM package list):
   ```sh
   npx cap sync ios
   ```
3. Open the project:
   ```sh
   npx cap open ios               # same as: open ios/App/App.xcodeproj
   ```
   There is no `.xcworkspace` (SPM, not CocoaPods). Xcode resolves the Swift packages
   on first open (File › Packages › Resolve Package Versions if it doesn't).
4. In Xcode select the **App** project › **App** target:
   - **Signing & Capabilities**: tick *Automatically manage signing*, choose your
     **Team**, confirm **Bundle Identifier** = `ai.zip1.folio` (or your chosen ID).
   - **General**: set **Version** (e.g. `1.0`) and **Build** (`1`; increase the build
     number for every upload).
5. Try it: pick an iPhone simulator or a connected iPhone and press Run (⌘R). Check:
   - search works and the page sits below the status bar/notch (not under it);
   - a result's arrow / "Open page" opens the in-app browser, Done returns to Folio;
   - the Share buttons open the share sheet; haptics fire on a real device;
   - turn on Airplane Mode and relaunch → the offline page; turn it off → Folio loads.
6. Register the app in App Store Connect (if not done): **Apps › + › New App**, platform
   iOS, name *Folio by Zip1*, primary language English (U.S.), bundle ID
   `ai.zip1.folio` (create it first under Certificates, Identifiers & Profiles ›
   Identifiers if it isn't listed), SKU e.g. `folio-ios`.
7. Archive: choose **Any iOS Device (arm64)** as the run destination, then
   **Product › Archive**.
8. In the Organizer: **Distribute App › App Store Connect › Upload**, keep automatic
   signing, and upload. Export compliance is pre-answered
   (`ITSAppUsesNonExemptEncryption = NO`, the app only uses HTTPS).
9. After processing (10–30 min) the build appears under **TestFlight**; install it on
   your phone via TestFlight, then attach it to the version on the **App Store** tab and
   **Submit for Review**.

## App Store Connect checklist

- [ ] **Name**: `Folio by Zip1` (30 char max)
- [ ] **Subtitle**: `Web, Wikipedia & Grokipedia` (27/30)
- [ ] **Category**: Primary *Reference* (or *Utilities*); secondary optional
- [ ] **Description**, **Promotional text**, **Keywords**: drafts below
- [ ] **Support URL**: `https://www.zip1.ai/about`
- [ ] **Marketing URL** (optional): `https://www.zip1.ai`
- [ ] **Privacy Policy URL**: **required, and the site doesn't have one yet.** Publish a
      page (e.g. `https://www.zip1.ai/privacy`) before submitting. Outline below.
- [ ] **Screenshots** (PNG/JPEG, no transparency, 3–10 each):
  - 6.9" iPhone: 1320 × 2868 (or 1290 × 2796) portrait. Capture on the *iPhone 17 Pro
    Max* / *16 Pro Max* simulator (⌘S in Simulator saves a correctly sized PNG).
  - 6.5" iPhone: 1284 × 2778 (or 1242 × 2688). Capture on an *iPhone 11 Pro Max* /
    *XS Max*-class simulator, or let App Store Connect scale down the 6.9" set if it
    offers to.
  - No iPad screenshots needed (iPhone-only build).
  - Suggested shots: home with Trending; results for a query with the Wikipedia card; Images grid;
    preview sheet with Share; location references; definitions; offline screen.
- [ ] **App icon**: taken from the build (1024 × 1024, opaque); nothing to upload.
- [ ] **Age rating**: fill in the questionnaire honestly. Folio shows unfiltered public
      web results, so answer **Yes to "Unrestricted Web Access"**, which gives the
      highest age rating (18+). Everything else (violence, gambling, and so on): None.
- [ ] **App Privacy (nutrition labels)**: see below.
- [ ] **Pricing and availability**: Free; choose countries.
- [ ] **App Review Information**: contact name/phone/email; no sign-in, so no demo
      account needed. Notes for the reviewer (draft below).
- [ ] **Version release**: manual or automatic after approval.

### Reviewer notes (draft)

> Folio is a search app that brings together web results, images, Wikipedia and Grokipedia.
> No account is needed. Try searching "Paris", tap a result to open the preview
> sheet, use the Share button, or tap the arrow to open the page in the in-app browser.
> The source toggles let you include or leave out Wikipedia and Grokipedia. With no
> connection, the app shows its own offline screen and reconnects automatically.

### App Privacy answers (based on what the site does today)

What Folio does with data (checked in the code on `main`):

- No accounts, sign-in, analytics SDKs, advertising identifier (IDFA) or tracking. No
  App Tracking Transparency prompt is needed.
- Search queries (and the optional "near" place text) go to Folio's server on Vercel,
  which forwards them to Bing (results and related searches), Wikipedia, Grokipedia,
  Datamuse (word definitions) and Open-Meteo geocoding (place lookups) to build results.
  Folio does not store queries in a database, but Vercel's request logs contain the
  search URL for a limited retention period.
- Source toggles, recent searches and the ad preference are stored **on the device**
  (localStorage) only.
- Ads are **off by default**. If the user turns them on, Folio's server asks Kevel for
  one ad **without the search query**; the ad image/click go to Kevel.
- Result favicons load from Google's favicon service (the request includes the result's
  domain).

Suggested answers (conservative, since queries are sent to the server and appear in logs):

- **Do you or your third-party partners collect data from this app?** Yes.
- **Search History**: collected; used for **App Functionality**; **not linked** to the
  user's identity; **not used for tracking**.
- Nothing else is collected (no contact info, identifiers, location, usage data,
  diagnostics or purchases). If you add analytics or crash reporting later, update
  the labels.
- If Vercel request logging is turned off so queries aren't kept after the request,
  you may instead answer "Data Not Collected". Match the privacy policy either way.

`ios/App/App/PrivacyInfo.xcprivacy` declares no tracking, no tracking domains and no
required-reason API use by the app itself (Capacitor and its plugins ship their own
manifests).

### Privacy policy outline (for a /privacy page on the site)

1. Who we are (Zip1 / Folio) and a contact email.
2. What we process: search text you enter, sent to our server and to the search
   providers listed above to return results; standard server logs (IP address, user
   agent, requested URL including the query) kept by our host for a limited period.
3. What stays on your device: source settings, recent searches, ad preference.
4. Ads: off by default; when on, one ad request to Kevel without your query.
5. No accounts, no selling of data, no cross-app tracking.
6. Third parties: Bing, Wikipedia, Grokipedia, Datamuse, Open-Meteo, Google favicon
   service, Google Trends (trending topics, no user data), Kevel (opt-in ads), Vercel (hosting).
7. Children: not directed at children under 13.
8. Changes and contact.

## Listing copy (drafts, based on current features)

**Promotional text** (170 max):

> Search the web, Wikipedia and Grokipedia in one place. Tap a result to preview it,
> share it with the native share sheet, or open the page without leaving Folio.

**Description**:

> Folio by Zip1 is a clean, fast search app. Type a question or topic and get results
> from the public web, with Wikipedia and Grokipedia as optional sources, all in one place.
>
> SEARCH YOUR WAY
> • Web results for news, official sites and the rest of the public web
> • Images: a photo grid with a preview and a link to the full-size image
> • Turn Wikipedia and Grokipedia on or off, and Folio remembers your choice
> • Suggestions as you type, trending topics, and your recent searches (kept on your device)
>
> PREVIEW BEFORE YOU GO
> • Tap any result to open a preview with the title and summary
> • Wikipedia and Grokipedia previews load a longer extract; YouTube results play right in the preview
> • Step through results with next and previous
>
> ANSWERS AT A GLANCE
> • A short summary card for the topic you searched
> • Short definitions for words in your query
> • Location references with coordinates and a map link when your search names a place
> • "Deep dive" follow-up searches to go further
>
> MADE FOR IPHONE
> • Share any result or search with the iOS share sheet
> • Open pages in the in-app browser and come right back to your results
> • Light haptic feedback as you search and browse
> • A friendly offline screen that reconnects on its own
>
> PRIVATE BY DEFAULT
> • No account needed
> • No tracking
> • Sponsored listings stay off unless you turn them on, and your search is never sent to the ad network
>
> Folio is a search interface, not an encyclopedia. It is not affiliated with Bing,
> Wikipedia or Grokipedia.

**Keywords** (100 max, comma-separated, no spaces needed; don't repeat words from the name):

```
search,web search,wikipedia,grokipedia,encyclopedia,browser,answers,reference,lookup,wiki,research
```

(98 characters.)

## Guideline notes and risks

- **4.2 Minimum functionality / web wrappers**: apps that only show a website are often
  rejected. The native share sheet, haptics, in-app browser, offline screen and
  launch/status-bar styling are there to address this. If Apple still rejects under
  4.2, the next native features to add are saving images to Photos, a Share Extension ("Search with Folio" from selected text), home-screen quick
  actions, or a widget.
- **Remote content updates**: because the app loads the live site, the web UI can
  change without a new build. That's allowed as long as the app's core purpose doesn't
  change (guideline 2.5.2 / 4.7); don't turn it into a different app through the website.
- **Safe area**: the site has no `viewport-fit=cover`, so WebKit keeps content inside the
  safe area. Check on a notch/Dynamic Island device in step 5; if the top header ever
  sits under the status bar, set `ios.contentInset: "always"` in `capacitor.config.ts`
  and run `npx cap sync ios`.
- The Capacitor docs describe `server.url` as intended for live reload. It works fine in
  production, but you own the uptime: if www.zip1.ai is down, users see the offline
  screen.
