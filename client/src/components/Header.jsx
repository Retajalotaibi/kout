// Public header: logo and tagline only.
// Diagnostics stay available to the team at /api/health and /api/stats (not linked from the UI).
export default function Header() {
  return (
    <header className="flex items-center justify-between border-b border-paper-line bg-white px-4 py-2">
      <div className="flex items-center gap-2">
        <img src="/logo.png" alt="Kout · كوت" className="h-9 w-auto" />
        <span className="hidden text-xs text-ink-faint sm:inline">
          Kuwait government services, from official sources
        </span>
      </div>
    </header>
  );
}
