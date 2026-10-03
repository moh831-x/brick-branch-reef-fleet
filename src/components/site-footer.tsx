import { Link } from "@tanstack/react-router";
import { type UiCopy } from "@/lib/ui-copy";
import { useLang } from "@/lib/lang-context";

export function SiteFooter({ copy }: { copy?: UiCopy }) {
  const { copy: pageCopy } = useLang();
  const words = copy ?? pageCopy;
  return (
    <footer className="mx-auto mt-6 w-full max-w-3xl border-t border-line px-4 py-8">
      <p className="font-display text-2xl tracking-tight text-ink italic">Folio</p>
      <nav aria-label="Folio" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
        <Link to="/" search={{ q: "", near: "" }} className="text-ink">
          {words.footerSearch}
        </Link>
        <Link to="/about">{words.footerAbout}</Link>
        <Link to="/privacy">{words.footerPrivacy}</Link>
        <Link to="/how-to-search">{words.footerHow}</Link>
      </nav>
    </footer>
  );
}
