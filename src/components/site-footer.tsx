import { Link } from "@tanstack/react-router";
import { UI, type UiCopy } from "@/lib/ui-copy";

export function SiteFooter({ copy = UI["en-US"] }: { copy?: UiCopy }) {
  return (
    <footer className="mx-auto w-full max-w-2xl px-4 py-10">
      <nav aria-label="Folio" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
        <Link to="/" search={{ q: "", near: "" }} className="text-ink">
          {copy.footerSearch}
        </Link>
        <Link to="/about">{copy.footerAbout}</Link>
        <Link to="/privacy">{copy.footerPrivacy}</Link>
        <Link to="/how-to-search">{copy.footerHow}</Link>
      </nav>
    </footer>
  );
}