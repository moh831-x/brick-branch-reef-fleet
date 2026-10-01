import { Link } from "@tanstack/react-router";
import { type UiCopy } from "@/lib/ui-copy";
import { useLang } from "@/lib/lang-context";

export function SiteFooter({ copy }: { copy?: UiCopy }) {
  const { copy: pageCopy } = useLang();
  const words = copy ?? pageCopy;
  return (
    <footer className="mx-auto w-full max-w-2xl px-4 py-10">
      <nav aria-label="Folio" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
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
