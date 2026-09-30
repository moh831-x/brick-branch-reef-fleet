/**
 * Regenerates the iOS app icon and splash images from assets/ios/icon.svg and
 * public/favicon.svg. sharp is not a project dependency, so install it first:
 *
 *   npm i --no-save sharp && node scripts/ios-assets.mjs
 *
 * Outputs (committed):
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png  1024x1024, opaque (App Store icon)
 *   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png  2732x2732 launch image
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sharp = (await import("sharp")).default;
const root = new URL("..", import.meta.url).pathname;
const xcassets = join(root, "ios/App/App/Assets.xcassets");
const BG = "#f3efe6";

// App icon: single 1024 universal icon (Xcode 14+ derives every other size).
// Flatten + removeAlpha: App Store rejects icons with an alpha channel.
await sharp(readFileSync(join(root, "assets/ios/icon.svg")), { density: 2304 })
  .resize(1024, 1024)
  .flatten({ background: "#0E6B52" })
  .removeAlpha()
  .png()
  .toFile(join(xcassets, "AppIcon.appiconset/AppIcon-512@2x.png"));

// Splash: paper background with the Folio mark centred (scaled aspect-fill by
// LaunchScreen.storyboard, so keep the mark small and central).
const SIZE = 2732;
const MARK = 420;
const mark = await sharp(readFileSync(join(root, "public/favicon.svg")), { density: 1200 })
  .resize(MARK, MARK)
  .png()
  .toBuffer();
const splash = await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: BG } })
  .composite([{ input: mark, left: (SIZE - MARK) / 2, top: (SIZE - MARK) / 2 }])
  .removeAlpha()
  .png()
  .toBuffer();
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await sharp(splash).toFile(join(xcassets, "Splash.imageset", name));
}
console.log("iOS icon + splash written");
