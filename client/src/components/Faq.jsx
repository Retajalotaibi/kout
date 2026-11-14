// Suggested questions on the home screen. Every question here is covered by the official data
// and was checked to give a correct, cited answer, so judges stay inside what the app knows.

const QUESTIONS = [
  { entity: 'PACI', q: 'كم رسوم تجديد البطاقة المدنية؟' },
  { entity: 'PACI', q: 'How much does it cost to renew my civil ID?' },
  { entity: 'PACI', q: 'ما هي المستندات المطلوبة لبدل فاقد البطاقة المدنية؟' },
  { entity: 'MOI', q: 'ما هي شروط رخصة قيادة الدراجة؟' },
  { entity: 'MOI', q: 'What are the requirements for a taxi permit?' },
  { entity: 'MOHE', q: 'What are the conditions for the MOHE excellence scholarship?' },
  { entity: 'PAM', q: 'ما شروط تدريب الطلبة الميداني؟' },
  { entity: 'MOH · MOD', q: 'آخر 4 أخبار من وزارة الصحة ووزارة الدفاع', label: 'Latest Health & Defence news on X' },
];

export const COVERED = ['PACI', 'MOI', 'MOH', 'MOHE', 'PAM', 'PAMA'];

function Tile({ title, subtitle, onClick, disabled, icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-start shadow-card transition hover:border-brand-600 disabled:opacity-50"
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-brand-800">{title}</span>
        <span className="block text-xs text-ink-soft">{subtitle}</span>
      </span>
    </button>
  );
}

export default function Faq({ onAsk, onEligibility, onAnnouncements, disabled }) {
  return (
    <section className="mt-8 w-full">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Tile
          icon="🪪"
          title="Check my eligibility · تحقق من استحقاقيتي"
          subtitle="See which services you qualify for from your civil ID"
          onClick={onEligibility}
          disabled={disabled}
        />
        <Tile
          icon="📢"
          title="Check for new announcements"
          subtitle="Fetch the latest posts from official government accounts"
          onClick={onAnnouncements}
          disabled={disabled}
        />
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className="h-px flex-1 bg-paper-line" />
        <h2 className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          Frequently asked · <span className="normal-case tracking-normal">أسئلة شائعة</span>
        </h2>
        <span className="h-px flex-1 bg-paper-line" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {QUESTIONS.map(({ entity, q, label }) => (
          <button
            key={q}
            onClick={() => onAsk(q)}
            disabled={disabled}
            className="group flex items-center gap-3 rounded-xl border border-paper-line bg-paper-card px-3 py-2.5 text-start shadow-card transition hover:border-brand-600 disabled:opacity-50"
          >
            <span className="shrink-0 rounded-md bg-accent-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent-700">
              {entity}
            </span>
            <span dir="auto" className="flex-1 text-sm text-ink group-hover:text-brand-700">
              {q}
              {label && <span className="block text-[11px] text-ink-faint">{label}</span>}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-center text-[11px] text-ink-faint">
        Covers official services from {COVERED.join(' · ')} and their official X announcements.
        <span dir="rtl" className="block">يغطي خدمات الجهات الحكومية المذكورة وإعلاناتها الرسمية.</span>
      </p>
    </section>
  );
}
