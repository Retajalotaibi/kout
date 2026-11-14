import { useEffect, useRef, useState } from 'react';
import { canListen, listen } from '../lib/speech.js';

const MIC_ERRORS = {
  'not-allowed': 'Microphone access was blocked. Allow it in the browser and try again. · تم رفض الوصول للميكروفون.',
  'service-not-allowed': 'Microphone access was blocked. · تم رفض الوصول للميكروفون.',
  'no-speech': "I didn't hear anything. Try again. · لم أسمع شيئاً، حاول مرة أخرى.",
  'audio-capture': 'No microphone found. · لا يوجد ميكروفون.',
  network: 'Speech recognition needs an internet connection. · يتطلب التعرف على الصوت اتصالاً بالإنترنت.',
};

export default function Composer({ disabled, onSend }) {
  const [text, setText] = useState('');
  const [lang, setLang] = useState('ar-KW');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState(null);
  const stopRef = useRef(null);
  const heardRef = useRef('');

  useEffect(() => () => stopRef.current?.(), []);

  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend?.(t);
    setText('');
  };

  function toggleMic() {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setMicError(null);
    heardRef.current = '';
    setListening(true);
    stopRef.current = listen({
      lang,
      onText: (t) => {
        heardRef.current = t;
        setText(t);
      },
      onError: (code) => {
        if (code !== 'aborted') setMicError(MIC_ERRORS[code] ?? `Voice input failed (${code}).`);
      },
      onEnd: () => {
        setListening(false);
        stopRef.current = null;
        const heard = heardRef.current.trim();
        if (heard && !disabled) {
          onSend?.(heard, { voice: true });
          setText('');
        }
      },
    });
  }

  return (
    <div className={`rounded-2xl border border-paper-line bg-paper-card p-3 shadow-composer ${disabled ? 'opacity-70' : ''}`}>
      <textarea
        dir="auto"
        rows={2}
        value={text}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={listening ? 'Listening… · أستمع…' : 'Ask about a government service, or tap the mic · اسأل عن خدمة حكومية أو اضغط على الميكروفون'}
        className="w-full resize-none bg-transparent px-1 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed"
      />
      {micError && <p dir="auto" className="px-1 pb-1 text-xs text-red-700">{micError}</p>}
      <div className="flex items-center justify-end gap-2">
        {canListen && (
          <>
            <div className="flex overflow-hidden rounded-lg border border-paper-line text-xs" title="Voice language · لغة الصوت">
              {[['ar-KW', 'عربي'], ['en-US', 'EN']].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLang(v)}
                  disabled={listening}
                  className={`px-2 py-1 ${lang === v ? 'bg-paper-muted text-ink' : 'text-ink-faint hover:text-ink-soft'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleMic}
              disabled={disabled && !listening}
              title={listening ? 'Stop · إيقاف' : 'Speak your question · تحدث بسؤالك'}
              aria-label="Voice input"
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                listening ? 'animate-pulse bg-red-600 text-white' : 'border border-paper-line text-ink-soft hover:text-ink'
              } disabled:cursor-not-allowed disabled:opacity-30`}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="M10 2a3 3 0 00-3 3v5a3 3 0 006 0V5a3 3 0 00-3-3zm-5 8a1 1 0 112 0 3 3 0 006 0 1 1 0 112 0 5 5 0 01-4 4.9V17h2a1 1 0 110 2H7a1 1 0 110-2h2v-2.1A5 5 0 015 10z" />
              </svg>
            </button>
          </>
        )}
        <button
          onClick={send}
          disabled={disabled || !text.trim()}
          title="Send"
          aria-label="Send"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path d="M10 3l6 6-1.4 1.4L11 6.8V17H9V6.8L5.4 10.4 4 9z" /></svg>
        </button>
      </div>
    </div>
  );
}
