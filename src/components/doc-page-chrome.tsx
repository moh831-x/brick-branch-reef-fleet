import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LanguagePicker } from "@/components/language-picker";
import { SiteFooter } from "@/components/site-footer";
import { useLang } from "@/lib/lang-context";

/**
 * Shared frame for the written pages (About, How to search, Privacy). The menus, links, and
 * footer follow the site language. The long-form text is written in English only, so it is
 * marked lang="en" and kept left-to-right, with a note in the reader's language.
 */
export function DocPage({ children }: { children: ReactNode }) {
  const { lang, copy } = useLang();
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pt-12">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link to="/" search={{ q: "", near: "" }} className="font-display text-2xl tracking-tight text-ink">
          Folio
        </Link>
        <LanguagePicker />
      </div>
      {lang !== "en-US" ? (
        <p className="mb-6 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">{copy.englishOnly}</p>
      ) : null}
      <div lang="en" dir="ltr">
        {children}
      </div>
      <p className="mt-8">
        <Link to="/" search={{ q: "", near: "" }} className="text-sm font-medium text-ink">
          {copy.backToSearch}
        </Link>
      </p>
      <SiteFooter />
    </main>
  );
}
