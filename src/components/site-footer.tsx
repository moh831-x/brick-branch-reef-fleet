import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-2xl px-4 py-10">
      <nav aria-label="Folio" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
        <Link to="/" search={{ q: "", near: "" }} className="text-ink">
          Search
        </Link>
        <Link to="/about">About</Link>
        <Link to="/how-to-search">How to search</Link>
      </nav>
    </footer>
  );
}
