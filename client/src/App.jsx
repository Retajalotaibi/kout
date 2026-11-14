import { useCallback, useEffect, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Composer from './components/Composer.jsx';
import Conversation from './components/Conversation.jsx';
import { ask, poll, stats as fetchStats } from './api.js';


let nextId = 1;

export default function App() {
  const [messages, setMessages] = useState([]); // { id, kind: 'user'|'poll'|'posts'|'error'|'pending', ... }
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const refreshStats = useCallback(() => fetchStats().then(setStats).catch(() => {}), []);
  useEffect(() => { refreshStats(); }, [refreshStats]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const push = (m) => setMessages((ms) => [...ms, { id: nextId++, ...m }]);
  const replacePending = (m) =>
    setMessages((ms) => [...ms.filter((x) => x.kind !== 'pending'), { id: nextId++, ...m }]);

  async function checkAnnouncements() {
    if (busy) return;
    setBusy(true);
    push({ kind: 'user', text: 'Check for new announcements' });
    push({ kind: 'pending', text: 'Checking official X accounts…' });
    try {
      const r = await poll();
      replacePending({ kind: 'poll', result: r });
    } catch (err) {
      replacePending({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
      refreshStats();
    }
  }

  async function send(text) {
    if (busy) return;
    setBusy(true);
    push({ kind: 'user', text });
    push({ kind: 'pending', text: 'Looking it up…' });
    try {
      // Last few question/answer turns so follow-ups ("and the fee?") work.
      const history = messages
        .filter((m) => m.kind === 'user' || m.kind === 'answer')
        .slice(-6)
        .map((m) => ({ role: m.kind === 'user' ? 'user' : 'assistant', content: m.kind === 'user' ? m.text : m.answer }));
      const r = await ask(text, history);
      if (r.kind === 'tweets') replacePending({ kind: 'posts', text: r.text, summary: r.summary, posts: r.posts });
      else if (r.kind === 'answer') replacePending({ kind: 'answer', ...r });
      else replacePending({ kind: 'text', text: r.text });
    } catch (err) {
      replacePending({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;
  const actions = [
    { label: 'Check my eligibility · تحقق من أهليتي', onClick: () => push({ kind: 'eligibility' }) },
    { label: 'Check for new announcements', onClick: checkAnnouncements },
    { label: 'Show the latest 4 tweets', onClick: () => send('Show the latest 4 tweets') },
    { label: 'آخر تغريدة مفيدة', onClick: () => send('آخر تغريدة مفيدة') },
  ];

  return (
    <div className="flex h-full flex-col">
      <Header stats={stats} />

      {empty ? (
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-24">
          <h1 className="mb-1 text-center font-serif text-3xl text-ink sm:text-4xl">How can I help you today?</h1>
          <p dir="rtl" className="mb-8 text-center font-serif text-xl text-ink-soft">كيف يمكنني مساعدتك اليوم؟</p>
          <div className="w-full max-w-2xl">
            <Composer disabled={busy} onSend={send} />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {actions.map((a) => (
                <button
                  key={a.label}
                  dir="auto"
                  onClick={a.onClick}
                  disabled={busy}
                  className="rounded-lg border border-paper-line bg-paper-card px-3 py-1.5 text-sm text-ink-soft hover:border-ink-faint hover:text-ink disabled:opacity-50"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </main>
      ) : (
        <>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-4 py-6">
              <Conversation messages={messages} />
              <div ref={endRef} />
            </div>
          </main>
          <div className="bg-paper px-4 pb-3">
            <div className="mx-auto max-w-2xl">
              <div className="mb-2 flex flex-wrap gap-2">
                {actions.map((a) => (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    disabled={busy}
                    className="rounded-lg border border-paper-line bg-paper-card px-2.5 py-1 text-xs text-ink-soft hover:border-ink-faint hover:text-ink disabled:opacity-50"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <Composer disabled={busy} onSend={send} />
            </div>
          </div>
        </>
      )}

      <footer className="px-4 pb-3 text-center text-[11px] leading-relaxed text-ink-faint">
        Answers come from official sources only. Always confirm with the relevant government entity.
        <span dir="rtl" className="block">الإجابات مأخوذة من مصادر رسمية فقط. يرجى دائماً التأكد من الجهة الحكومية المختصة.</span>
      </footer>
    </div>
  );
}
