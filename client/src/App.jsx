import { useEffect, useState } from 'react';
import { health as fetchHealth, stats as fetchStats, posts as fetchPosts } from './api.js';

function Row({ label, ok, detail }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-brand-600' : 'bg-red-500'}`} />
      <span>
        <span className="font-medium">{label}</span>
        {detail && <span className="text-slate-500"> · {detail}</span>}
      </span>
    </li>
  );
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    fetchHealth().then(setHealth).catch((e) => setError(e.message));
    fetchStats().then(setStats).catch(() => {});
    fetchPosts().then(setPosts).catch(() => {});
  }, []);

  const a = health?.anthropic;
  const x = health?.x;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-lg font-semibold text-brand-800">Kout · كوت</h1>
      <p className="text-sm text-slate-600">
        Ask about Kuwaiti government services in Arabic or English.
        <span className="mx-1 text-slate-300">|</span>
        <span dir="rtl">اسأل عن الخدمات الحكومية في الكويت</span>
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="mb-3 font-semibold">System status</h2>
        {error && <p className="text-red-600">Server not reachable: {error}</p>}
        {!health && !error && <p className="text-slate-500">Checking…</p>}
        {health && (
          <ul className="space-y-2">
            <Row label="Anthropic key" ok={a.keySet} detail={a.keySet ? 'set' : 'missing in .env'} />
            <Row label="Chat model" ok={a.chat.ok} detail={a.chat.ok ? a.chat.model : a.chat.error} />
            <Row label="Fast model" ok={a.fast.ok} detail={a.fast.ok ? a.fast.model : a.fast.error} />
            <Row label="X token" ok={x.tokenSet} detail={x.tokenSet ? 'set' : 'missing in .env (fixtures will be used)'} />
            <Row label="X accounts" ok={x.enabledAccounts.length > 0} detail={x.enabledAccounts.join(', ') || 'none enabled'} />
          </ul>
        )}
        {stats && (
          <p className="mt-3 text-xs text-slate-500">
            Claude spend: ${stats.llm.spentUsd.toFixed(4)} of ${stats.llm.capUsd.toFixed(2)} ({stats.llm.calls} calls)
            <span className="mx-1 text-slate-300">|</span>
            X spend: ${stats.x.spentUsd.toFixed(3)} of ${stats.x.capUsd.toFixed(2)}
          </p>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="mb-3 font-semibold">Recent X posts ({posts.length})</h2>
        {posts.length === 0 && <p className="text-slate-500">No posts yet. Run <code>npm run ingest:x</code>.</p>}
        <ul className="divide-y divide-slate-100">
          {posts.map((p) => (
            <li key={p.id} className="py-2">
              <div className="mb-1 text-xs text-slate-500">
                @{p.account} · {String(p.date).slice(0, 10)} ·{' '}
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">open on X</a>
              </div>
              <p dir="auto" className="whitespace-pre-wrap text-slate-800">{p.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
