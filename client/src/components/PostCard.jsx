export default function PostCard({ post: p }) {
  const kept = p.label && p.label.category !== 'not_relevant';
  return (
    <div className={`rounded-xl border border-paper-line bg-paper-card px-3 py-2.5 ${p.label && !kept ? 'opacity-60' : ''}`}>
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint" dir="ltr">
        <span className="rounded bg-ink px-1.5 py-0.5 font-medium text-white">X post</span>
        <span className="font-medium text-ink-soft">@{p.account}</span>
        <span>{String(p.date).slice(0, 10)}</span>
        {p.label && (
          <span className={`rounded px-1.5 py-0.5 ${kept ? 'bg-brand-100 text-brand-800' : 'bg-paper-muted text-ink-faint'}`}>
            {kept ? `kept · ${p.label.category} · ${p.label.topic}` : 'dropped'}
          </span>
        )}
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="ms-auto text-brand-700 hover:underline">Open on X ↗</a>
      </div>
      <p dir="auto" className="whitespace-pre-wrap text-sm text-ink">{p.text}</p>
      {p.label?.summary_en && <p dir="ltr" className="mt-1 text-xs italic text-ink-soft">{p.label.summary_en}</p>}
    </div>
  );
}
