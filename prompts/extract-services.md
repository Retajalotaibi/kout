Convert text copied from Kuwaiti government web pages into JSON for a chatbot.

Each page starts with: === <URL> | copied <date> ===

Reply with ONLY a JSON array, one object per service, using these fields:
service_ar, service_en, entity, topic (civil_id / residency / traffic / work / health / education / other), audience, channels[], conditions[], documents[], fees, exemptions[], steps[], apply_url, source_url, copied_on, unclear[]

Rules:
- Copy Arabic text exactly as written. Don't rephrase or summarize.
- Never add information that isn't on the page.
- Keep numbers, fees, phone numbers, law numbers and links exactly as written.
- Ignore menus, buttons and footers.
- Use [] or null when something is missing.
- If anything is ambiguous, explain it in one short English sentence in "unclear". Don't guess.
- If a page has no service information, return [].
