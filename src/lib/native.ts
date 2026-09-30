/**
 * Native (Capacitor iOS app) helpers.
 *
 * The iOS app loads the live site, and Capacitor injects `window.Capacitor`
 * before the page runs. In a normal browser that global is absent, so every
 * helper here is a no-op and the plugin modules are never downloaded (they
 * are dynamic imports, split into their own chunks).
 */
import { useEffect, useState } from "react";

type CapacitorGlobal = { isNativePlatform?: () => boolean };

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** False during SSR and first render (no hydration mismatch), then the real value. */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativeApp());
  }, []);
  return native;
}

/** Light haptic tick for key taps. No-op on the web. */
export function tap(kind: "light" | "medium" | "select" = "light"): void {
  if (!isNativeApp()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle }) =>
      kind === "select"
        ? Haptics.selectionChanged()
        : Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light }),
    )
    .catch(() => {});
}

/** Native share sheet. Resolves false when unavailable or dismissed. */
export async function shareNative(options: {
  title?: string;
  text?: string;
  url: string;
}): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { Share } = await import("@capacitor/share");
    await Share.share({ ...options, dialogTitle: options.title });
    return true;
  } catch {
    return false;
  }
}

/** Open an external page in the in-app browser (SFSafariViewController). */
export async function openInApp(url: string): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url, presentationStyle: "fullscreen" });
}

const APP_HOSTS = new Set(["zip1.ai", "www.zip1.ai"]);

function externalHref(anchor: HTMLAnchorElement): string | null {
  if (anchor.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin === window.location.origin || APP_HOSTS.has(url.hostname)) return null;
  return url.href;
}

/**
 * One-time native setup: status bar, splash, and routing every off-site link
 * (result links, "Open page", references, maps…) to the in-app browser instead
 * of navigating the app's web view away from Folio.
 */
export function startNativeShell(): () => void {
  if (!isNativeApp()) return () => {};
  document.documentElement.classList.add("native-app");

  void import("@capacitor/status-bar")
    .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Light }))
    .catch(() => {});
  void import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => SplashScreen.hide())
    .catch(() => {});

  function onClick(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = externalHref(anchor);
    if (!href) return;
    event.preventDefault();
    tap("light");
    void openInApp(href).catch(() => {
      window.location.href = href;
    });
  }

  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
