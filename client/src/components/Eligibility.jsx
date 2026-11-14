import { useEffect, useMemo, useState } from 'react';
import { eligibility as fetchEligibility } from '../api.js';

// ---------------------------------------------------------------- civil ID → birth date (browser only)
// Kuwaiti civil ID: 12 digits. Digit 1 = century (2 → 1900s, 3 → 2000s), digits 2–7 = YYMMDD of birth.
const toLatin = (s) => String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

export function birthDateFromCivilId(raw) {
  const id = toLatin(raw).replace(/\D/g, '');
  if (id.length !== 12) return { error: 'len' };
  const century = { 2: 1900, 3: 2000 }[id[0]];
  if (!century) return { error: 'format' };
  const y = century + Number(id.slice(1, 3));
  const m = Number(id.slice(3, 5));
  const d = Number(id.slice(5, 7));
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return { error: 'format' };
  if (date > new Date()) return { error: 'format' };
  return { date };
}

function ageOn(birth, today = new Date()) {
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

// ---------------------------------------------------------------- rule check
const NAT_LABEL = {
  kuwaiti: 'Kuwaiti only · كويتي فقط',
  non_kuwaiti: 'Non-Kuwaiti only · لغير الكويتيين',
  kuwaiti_or_kuwaiti_mother: 'Kuwaiti or child of a Kuwaiti mother · كويتي أو من أبناء الكويتيات',
};

function check(svc, age, kuwaiti) {
  const rules = [];
  if (svc.min_age !== null || svc.max_age !== null) {
    const ok = (svc.min_age === null || age >= svc.min_age) && (svc.max_age === null || age <= svc.max_age);
    const range =
      svc.min_age !== null && svc.max_age !== null ? `${svc.min_age}–${svc.max_age}`
        : svc.min_age !== null ? `${svc.min_age}+` : `≤ ${svc.max_age}`;
    rules.push({ label: `Age ${range} · العمر`, quote: svc.age_quote, ok });
  }
  if (svc.nationality) {
    const ok =
      svc.nationality === 'kuwaiti' ? kuwaiti
        : svc.nationality === 'non_kuwaiti' ? !kuwaiti
          : kuwaiti ? true : 'maybe';
    rules.push({ label: NAT_LABEL[svc.nationality], quote: svc.nationality_quote, ok });
  }
  const status = rules.some((r) => r.ok === false) ? 'no' : rules.some((r) => r.ok === 'maybe') ? 'maybe' : 'yes';
  return { status, rules };
}

const BADGE = {
  yes: ['bg-brand-50 text-brand-800', '✓ Meets age & nationality · مستوفٍ'],
  maybe: ['bg-amber-50 text-amber-900', '? Depends on your case · يعتمد على حالتك'],
  no: ['bg-red-50 text-red-800', '✗ Not eligible · غير مستوفٍ'],
};
const mark = (ok) => (ok === true ? '✓' : ok === false ? '✗' : '?');

function ServiceCard({ svc, result }) {
  const [cls, text] = BADGE[result.status];
  return (
    <div className="rounded-xl border border-paper-line bg-paper-card p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-faint">{svc.entity}</span>
        <span className={`rounded-md px-2 py-0.5 text-xs ${cls}`}>{text}</span>
      </div>
      <p dir="auto" className="font-medium text-ink">{svc.title_ar}</p>
      {svc.title_en && <p className="text-sm text-ink-soft">{svc.title_en}</p>}
      <ul className="mt-2 space-y-1 text-sm">
        {result.rules.map((r) => (
          <li key={r.label} dir="auto">
            <span className={r.ok === false ? 'text-red-700' : r.ok === true ? 'text-brand-700' : 'text-amber-700'}>{mark(r.ok)}</span>{' '}
            {r.label}
            {r.quote && <span className="block ps-4 text-xs text-ink-faint">«{r.quote}»</span>}
          </li>
        ))}
      </ul>
      {svc.other_conditions.length > 0 && (
        <div className="mt-2 text-sm">
          <p className="text-xs text-ink-soft">Also required (check yourself) · شروط أخرى:</p>
          <ul dir="auto" className="list-disc ps-5 text-xs text-ink-soft">
            {svc.other_conditions.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
      {svc.url && (
        <a href={svc.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brand-700 underline">
          Official page · الصفحة الرسمية{svc.copied_on ? ` (copied ${svc.copied_on})` : ''}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- panel
export default function Eligibility() {
  const [services, setServices] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [civilId, setCivilId] = useState('');
  const [birth, setBirth] = useState('');
  const [kuwaiti, setKuwaiti] = useState(true);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    fetchEligibility().then((r) => setServices(r.services)).catch((e) => setLoadError(e.message));
  }, []);

  const parsed = civilId.trim() ? birthDateFromCivilId(civilId) : null;
  const birthDate = parsed?.date ?? (birth ? new Date(`${birth}T00:00:00Z`) : null);

  function submit(e) {
    e.preventDefault();
    if (!birthDate || Number.isNaN(birthDate.getTime())) return;
    setSubmitted({ age: ageOn(birthDate), kuwaiti });
  }

  const results = useMemo(() => {
    if (!submitted || !services) return [];
    const order = { yes: 0, maybe: 1, no: 2 };
    return services
      .map((svc) => ({ svc, result: check(svc, submitted.age, submitted.kuwaiti) }))
      .sort((a, b) => order[a.result.status] - order[b.result.status]);
  }, [submitted, services]);
  const count = (st) => results.filter((r) => r.result.status === st).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-ink">Eligibility checker · فاحص الاستحقاقية</p>
        <p className="text-sm text-ink-soft">
          Enter your civil ID to see which official services you meet the age and nationality rules for.
          <span dir="rtl" className="block">أدخل رقمك المدني لمعرفة الخدمات التي تستوفي شروط العمر والجنسية فيها.</span>
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3 rounded-xl border border-paper-line bg-paper-card p-3">
        <label className="block text-sm">
          <span className="text-ink-soft">Civil ID number · الرقم المدني</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            value={civilId}
            onChange={(e) => setCivilId(e.target.value)}
            placeholder="e.g. 3XXXXXXXXXXX"
            className="mt-1 w-full rounded-lg border border-paper-line bg-paper px-3 py-2 tracking-wider outline-none focus:border-ink-faint"
          />
          {parsed?.error === 'len' && <span className="text-xs text-amber-700">Civil ID has 12 digits · الرقم المدني 12 رقماً</span>}
          {parsed?.error === 'format' && <span className="text-xs text-red-700">This doesn't look like a valid civil ID · رقم غير صالح</span>}
          {parsed?.date && (
            <span className="text-xs text-brand-700">Birth date from civil ID: {parsed.date.toISOString().slice(0, 10)} · age {ageOn(parsed.date)}</span>
          )}
        </label>

        {!parsed?.date && (
          <label className="block text-sm">
            <span className="text-ink-soft">…or birth date · أو تاريخ الميلاد</span>
            <input type="date" value={birth} onChange={(e) => setBirth(e.target.value)}
              className="mt-1 w-full rounded-lg border border-paper-line bg-paper px-3 py-2 outline-none focus:border-ink-faint" />
          </label>
        )}

        <div className="text-sm">
          <span className="text-ink-soft">Nationality · الجنسية</span>
          <div className="mt-1 flex gap-2">
            {[[true, 'Kuwaiti · كويتي'], [false, 'Non-Kuwaiti · غير كويتي']].map(([v, l]) => (
              <button type="button" key={l} onClick={() => setKuwaiti(v)}
                className={`rounded-lg border px-3 py-1.5 ${kuwaiti === v ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-paper-line text-ink-soft'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-ink-faint">🔒 Your civil ID is read only in this browser. It is never sent or saved. · لا يتم إرسال رقمك المدني أو حفظه.</p>
          <button type="submit" disabled={!birthDate || !services}
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm text-white disabled:opacity-40">
            Check · تحقق
          </button>
        </div>
      </form>

      {loadError && <p className="text-sm text-red-700">{loadError}</p>}

      {submitted && (
        <div className="space-y-3">
          <p className="text-sm text-ink-soft">
            Age <strong className="text-ink">{submitted.age}</strong> · {submitted.kuwaiti ? 'Kuwaiti' : 'Non-Kuwaiti'} —{' '}
            <span className="text-brand-700">{count('yes')} meet the rules</span>,{' '}
            <span className="text-amber-700">{count('maybe')} depend on your case</span>,{' '}
            <span className="text-red-700">{count('no')} not eligible</span> (of {results.length} services with age/nationality rules).
          </p>
          {results.map(({ svc, result }) => <ServiceCard key={svc.key} svc={svc} result={result} />)}
          <p className="text-[11px] text-ink-faint">
            Only the age and nationality rules are checked automatically, quoted exactly from the official pages. Always confirm with the entity.
          </p>
        </div>
      )}
    </div>
  );
}
