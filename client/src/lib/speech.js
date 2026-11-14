// Browser speech: Web Speech API for listening (speech → text) and speaking (text → speech).
// No server calls, no API cost. Recognition is supported in Chrome, Edge and Safari.

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const canListen = Boolean(Recognition);
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

export const isArabic = (s) => /[؀-ۿ]/.test(String(s ?? ''));

/**
 * Start listening. lang: 'ar-KW' | 'en-US'.
 * Calls onText(text, isFinal) as words arrive, onEnd() when it stops, onError(code) on failure.
 * Returns a stop() function.
 */
export function listen({ lang, onText, onEnd, onError }) {
  if (!Recognition) {
    onError?.('not-supported');
    return () => {};
  }
  const rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    onText?.(text.trim(), final);
  };
  rec.onerror = (e) => onError?.(e.error);
  rec.onend = () => onEnd?.();
  try {
    rec.start();
  } catch (err) {
    onError?.(err.message);
  }
  return () => {
    try { rec.stop(); } catch { /* already stopped */ }
  };
}

// Strip markdown and URLs so the answer reads naturally.
const plain = (t) =>
  String(t ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\*\*|__|[*_`#>]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .trim();

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.slice(0, 2);
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang?.startsWith(base)) ?? null;
}

/** Read text aloud in Arabic or English (picked from the text). onEnd fires when done or stopped. */
export function speak(text, { onEnd } = {}) {
  if (!canSpeak) return;
  window.speechSynthesis.cancel();
  const lang = isArabic(text) ? 'ar-SA' : 'en-US';
  const u = new SpeechSynthesisUtterance(plain(text));
  u.lang = lang;
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = lang.startsWith('ar') ? 0.95 : 1;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak) window.speechSynthesis.cancel();
}

// Some browsers load voices asynchronously; touch the list early so the first answer has a voice.
if (canSpeak) window.speechSynthesis.getVoices();
