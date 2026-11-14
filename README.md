# Kout · كوت

A bilingual (Arabic/English) chatbot that answers questions about Kuwaiti government services using only official sources: government websites and official X accounts. Every answer cites its sources.

See `MVP-SPEC.md` for the spec and `implementation-plan.md` for the build plan.

## Run locally
```
npm install
cp .env.example .env   # fill in the keys
npm run dev            # API on :3001, app on :5173
```

## Deploy on Render
The repo includes `render.yaml`: one Node web service that builds the React app and serves it together with the API from the same URL.

1. **MongoDB Atlas → Network Access:** allow `0.0.0.0/0` (Render's free plan has no fixed IPs). All app data (posts, knowledge, eligibility rules, caches, spend) lives in Atlas, so it survives redeploys.
2. **Render → New → Blueprint**, pick this GitHub repo. Render reads `render.yaml`.
3. Enter the three secrets when asked: `ANTHROPIC_API_KEY`, `X_BEARER_TOKEN`, `MONGODB_URI`. Never commit them.
4. Deploy. Health check: `/healthz`. Open the service URL — the app and `/api/*` are on the same origin.

Spend caps (`LLM_MAX_BUDGET_USD`, `X_MAX_BUDGET_USD`) are enforced on the server and stored in MongoDB, so they hold across restarts.
