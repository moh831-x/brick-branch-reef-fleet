import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { NativeShell } from "@/components/native-shell";
import { LangProvider } from "@/lib/lang";
import { useLang } from "@/lib/lang-context";
import { detectLang } from "@/lib/lang-state";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  // The page language, so the server renders the right words, `lang`, and `dir` the first time.
  loader: () => detectLang(),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#f3efe6" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,560;0,9..144,640;1,9..144,520&family=Outfit:wght@400;500;600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const initial = Route.useLoaderData();
  return (
    <LangProvider initial={initial}>
      <RootDocument />
    </LangProvider>
  );
}

function RootDocument() {
  const { lang, dir } = useLang();
  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1438612369373879"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <PreviewHostBridge />
        <NativeShell />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
