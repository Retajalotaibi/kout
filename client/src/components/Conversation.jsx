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
        {r.added === 0 && <> Use “Show stored posts” to see what's already saved.</>}
      </p>
      <p className="text-xs text-ink-faint">
        Source:{' '}
        <span className={live ? 'text-brand-700' : 'text-amber-700'}>{live ? 'live X API' : 'offline fixtures'}</span>
        {' · '}X spend {usd(r.spentUsd)} of {usd(r.capUsd, 2)} · Claude spend {usd(r.llm.spentUsd)} of {usd(r.llm.capUsd, 2)}
      </p>
      {r.newPosts.length > 0 && <div className="space-y-2">{r.newPosts.map((p) => <PostCard key={p.id} post={p} />)}</div>}
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
            {m.kind === 'poll' && <PollResult r={m.result} />}
            {m.kind === 'posts' && (
              <div className="space-y-3">
                <p>{m.posts.length ? `The ${m.posts.length} most recent stored posts:` : 'No posts stored yet.'}</p>
                <div className="space-y-2">{m.posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
