# manual/

Text copied by hand from official websites (including sites whose robots.txt disallows automated access, see `config/sites.json`).

One file per entity (`paci.md`, `moi.md`, `manpower.md`, `moh.md`, `mohe.md`, `pama.md`, `other.md`). The first line sets the entity:

    Entity: PACI

Then, for every page, a header line followed by the page text, copied exactly:

    === <page URL> | copied <YYYY-MM-DD> ===
    <page text>

Optional per-page entity: `=== <URL> | copied <date> | MOI ===`. Text inside `<!-- -->` comments is ignored.

Process with:

    npm run extract:services            # only new or edited pages are sent to Claude
    npm run extract:services -- --force # re-extract everything

Each page is turned into structured services with `prompts/extract-services.md`, saved to the database (`extracted_services`) and merged into the chatbot's knowledge. A drop-in JSON array in `data/services.json` is merged too.
