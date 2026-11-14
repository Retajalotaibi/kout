import { useState } from 'react';

export default function Composer({ disabled, onSend }) {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend?.(t);
    setText('');
  };

  return (
    <div className={`rounded-2xl border border-paper-line bg-paper-card p-3 shadow-composer ${disabled ? 'opacity-70' : ''}`}>
      <textarea
        dir="auto"
        rows={2}
        value={text}
        disabled={disabled}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={disabled ? 'Chat is coming in the next step — use the buttons below to test X for now.' : 'Ask about a government service… اكتب سؤالك'}
        className="w-full resize-none bg-transparent px-1 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed"
      />
      <div className="flex justify-end">
        <button
          onClick={send}
          disabled={disabled || !text.trim()}
          aria-label="Send"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor"><path d="M10 3l6 6-1.4 1.4L11 6.8V17H9V6.8L5.4 10.4 4 9z" /></svg>
        </button>
      </div>
    </div>
  );
}
