import PostCard from './PostCard.jsx';

const usd = (n, d = 3) => `$${(Number(n) || 0).toFixed(d)}`;

function PollResult({ r }) {
  const live = r.source === 'x_api';
  return (
    <div className="space-y-3">
      <p>
        {r.added === 0 ? (
          <>No new announcements since the last check.</>
        ) : (
          <>
            Found <strong>{r.added}</strong> new post{r.added === 1 ? '' : 's'}; <strong>{r.kept}</strong> kept as useful
            {r.kept !== r.added && <> ({r.added - r.kept} dropped as not relevant)</>}.
          </>
        )}
      </p>
      <p className="text-sm text-ink-soft">
        {live ? <>Checked {r.accounts.map((a) => `@${a}`).join(', ')}.</> : <>Live X wasn't available, so offline fixtures were used.</>}
        {r.newestStored && <> Newest post we have is from {new Date(r.newestStored).toLocaleString()}.</>}
      </p>
      <p className="text-xs text-ink-faint">
        Source:{' '}
        <span className={live ? 'text-brand-700' : 'text-amber-700'}>{live ? 'live X API' : 'offline fixtures'}</span>
        {' · '}X spend {usd(r.spentUsd)} of {usd(r.capUsd, 2)} · Claude spend {usd(r.llm.spentUsd)} of {usd(r.llm.capUsd, 2)}
      </p>
      {r.newPosts.length > 0 && <div className="space-y-2">{r.newPosts.map((p) => <PostCard key={p.id} post={p} />)}</div>}
      {r.added === 0 && r.latestPosts?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">Latest {r.latestPosts.length === 1 ? 'tweet' : 'tweets'} we have:</p>
          {r.latestPosts.map((p) => <PostCard key={p.id} post={p} />)}
        </div>
      )}
    </div>
  );
}

export default function Conversation({ messages }) {
  return (
    <div className="space-y-6">
      {messages.map((m) => {
        if (m.kind === 'user') {
          return (
            <div key={m.id} className="flex justify-end">
              <div dir="auto" className="max-w-[85%] rounded-2xl bg-paper-muted px-4 py-2.5 text-[15px]">{m.text}</div>
            </div>
          );
        }
        return (
          <div key={m.id} dir="auto" className="text-[15px] leading-relaxed">
            {m.kind === 'pending' && (
              <div className="flex items-center gap-2 text-ink-soft">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-600" />
                {m.text}
              </div>
            )}
            {m.kind === 'error' && <p className="text-red-700">{m.text}</p>}
            {m.kind === 'text' && <p className="text-ink-soft">{m.text}</p>}
            {m.kind === 'poll' && <PollResult r={m.result} />}
            {m.kind === 'answer' && (
              <div className="space-y-3">
                {m.change_note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{m.change_note}</p>}
                <div className={`whitespace-pre-wrap ${m.status === 'answered' ? 'text-ink' : 'text-ink-soft'}`}>{m.answer}</div>
                {m.sources?.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {m.sources.map((s) => (
                      <li key={s.id} dir="auto">
                        <span className="text-ink-faint">{s.sourceType === 'x_post' ? 'X post' : 'Website'} · {s.entity} · {s.date} · </span>
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-brand-700 underline">{s.title}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {m.kind === 'posts' && (
              <div className="space-y-3">
                {m.summary && (
                  <div className="rounded-xl bg-brand-50 px-4 py-3">
                    <p className="mb-1 text-xs font-medium text-brand-800">AI summary · ملخص</p>
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{m.summary}</div>
                  </div>
                )}
                <p className={m.summary ? 'text-sm text-ink-soft' : ''}>{m.text ?? (m.posts.length ? `The ${m.posts.length} most recent stored posts:` : 'No posts stored yet.')}</p>
                <div className="space-y-2">{m.posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
