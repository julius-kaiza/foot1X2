# Foot1X2 dual-provider integration

## Changes
- `football-fixtures.ts` now supports football-data.org and SportAPI.ai.
- The existing UI, authentication, prediction engine, payment handlers, and Render server are preserved.
- Refresh Leagues combines football-data.org competitions and SportAPI.ai leagues observed in a rolling 7-day fixture window.
- SportAPI league selection loads fixtures from a rolling 14-day window plus the preceding 2 days; football-data.org retains season history for its accessible leagues.
- SportAPI matches are normalized into the structure expected by the existing prediction UI.
- Provider secrets stay on Supabase; an authenticated user is required.
- Short-lived per-instance memory caching reduces repeat provider calls; it is NOT persistent across Edge Function instances.

## Deploy
1. Supabase > Edge Functions > create function named `football-fixtures`.
2. Replace its `index.ts` content with `football-fixtures.ts` and deploy.
3. Supabase > Edge Functions > Secrets: set `FOOTBALL_DATA_TOKEN` and `SPORTAPI_KEY`.
4. Confirm Supabase URL and publishable/anon key are available to the function.
5. Log into Foot1X2, click **Refresh Leagues**, choose a league, then **Fetch Fixtures**.
6. Inspect Supabase Edge Function logs if errors occur.

## Limitations and important safety notes
- No external API keys are included in this archive.
- SportAPI.ai publicly documents `https://sportapi.ai/api/fixtures?date=YYYY-MM-DD` and `X-Api-Key` auth. Its documentation also shows Bearer authentication in another example; if the key is rejected, confirm the method in your account's live docs.
- SportAPI league discovery is from fixtures observed in the next 7 days, NOT a complete league catalog. Leagues without upcoming games may not appear.
- Historical results for SportAPI leagues are only available within the requested date window; the prediction model may correctly report insufficient evidence. Full historical sync requires a persistent Supabase fixtures table, migrations and scheduled synchronization, not implemented in this ZIP.
- No live API-key integration tests were possible. Verify response shape and commercial redistribution permissions before launching a paid service.
- There is no automatic background synchronization in this upgrade. The function fetches on user requests.
