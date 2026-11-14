import { useEffect, useRef, useState } from 'react';
import { health as fetchHealth } from '../api.js';

const usd = (n, d = 2) => `$${(Number(n) || 0).toFixed(d)}`;

function Dot({ ok }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-red-500'}`} />;
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
    <header className="flex items-center justify-between border-b-2 border-gold-500 bg-brand-600 px-4 py-2.5 text-white">
      <div className="flex items-center gap-2">
        {/* Drop the logo at client/public/logo.png; hidden until it exists. */}
        <img src="/logo.png" alt="" className="h-8 w-auto" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <span className="font-serif text-lg">Kout <span className="text-gold-100">· كوت</span></span>
      </div>

      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-brand-50 hover:bg-brand-700"
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
          <div className="absolute end-0 z-10 mt-1 w-72 rounded-xl border border-paper-line bg-paper-card p-3 text-xs text-ink shadow-composer">
            {!health && <p className="text-ink-faint">Checking…</p>}
            {health?.error && <p className="text-red-600">Server not reachable.</p>}
            {a && x && (
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2"><Dot ok={a.keySet} /> Anthropic key {a.keySet ? 'set' : 'missing'}</li>
                <li className="flex items-center gap-2"><Dot ok={a.chat.ok} /> Chat model: {a.chat.model ?? a.chat.error}</li>
                <li className="flex items-center gap-2"><Dot ok={a.fast.ok} /> Fast model: {a.fast.model ?? a.fast.error}</li>
                <li className="flex items-center gap-2"><Dot ok={x.tokenSet} /> X token {x.tokenSet ? 'set' : 'missing (fixtures used)'}</li>
                <li className="flex items-center gap-2"><Dot ok={x.enabledAccounts.length > 0} /> X accounts: {x.enabledAccounts.join(', ') || 'none'}</li>
                {health.store && (
                  <li className="flex items-center gap-2">
                    <Dot ok={health.store.backend === 'mongodb'} /> Database: {health.store.backend === 'mongodb' ? `MongoDB (${health.store.detail})` : `local files — ${health.store.detail}`}
                  </li>
                )}
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
