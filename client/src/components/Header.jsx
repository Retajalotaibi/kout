import { useEffect, useRef, useState } from 'react';
import { health as fetchHealth } from '../api.js';

const usd = (n, d = 2) => `$${(Number(n) || 0).toFixed(d)}`;

function Dot({ ok }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-brand-600' : 'bg-red-500'}`} />;
}

export default function Header({ stats }) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const ref = useRef(null);

  useEffect(() => { fetchHealth().then(setHealth).catch(() => setHealth({ error: true })); }, []);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const a = health?.anthropic;
  const x = health?.x;
  const allOk = a && x && a.keySet && a.chat.ok && a.fast.ok && x.tokenSet;

  return (
    <header className="flex items-center justify-between px-4 py-3">
      <div className="font-serif text-lg text-ink">Kout <span className="text-ink-faint">· كوت</span></div>

      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-soft hover:bg-paper-muted"
        >
          {health && <Dot ok={Boolean(allOk)} />}
          {stats ? (
            <span>
              API spend: Claude {usd(stats.llm.spentUsd, 3)} of {usd(stats.llm.capUsd)} · X {usd(stats.x.spentUsd, 3)} of {usd(stats.x.capUsd)}
            </span>
          ) : (
            <span>Status</span>
          )}
        </button>

        {open && (
          <div className="absolute end-0 z-10 mt-1 w-72 rounded-xl border border-paper-line bg-paper-card p-3 text-xs shadow-composer">
            {!health && <p className="text-ink-faint">Checking…</p>}
            {health?.error && <p className="text-red-600">Server not reachable.</p>}
            {a && x && (
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2"><Dot ok={a.keySet} /> Anthropic key {a.keySet ? 'set' : 'missing'}</li>
                <li className="flex items-center gap-2"><Dot ok={a.chat.ok} /> Chat model: {a.chat.model ?? a.chat.error}</li>
                <li className="flex items-center gap-2"><Dot ok={a.fast.ok} /> Fast model: {a.fast.model ?? a.fast.error}</li>
                <li className="flex items-center gap-2"><Dot ok={x.tokenSet} /> X token {x.tokenSet ? 'set' : 'missing (fixtures used)'}</li>
                <li className="flex items-center gap-2"><Dot ok={x.enabledAccounts.length > 0} /> X accounts: {x.enabledAccounts.join(', ') || 'none'}</li>
              </ul>
            )}
            {stats && (
              <p className="mt-2 border-t border-paper-line pt-2 text-ink-faint">
                Knowledge: {stats.services} services · {stats.posts} posts · {stats.llm.calls} Claude calls
                {stats.x.lastPoll && <> · last X check {new Date(stats.x.lastPoll).toLocaleTimeString()}</>}
              </p>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
