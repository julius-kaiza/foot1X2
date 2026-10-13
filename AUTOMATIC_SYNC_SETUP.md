# Foot1X2 automatic dual-provider synchronization

## Files added
- `migrations/001_football_cache.sql`: additive Supabase tables, RLS enabled; direct public table access denied.
- `football-fixtures.ts`: existing authenticated GET endpoints plus machine-only POST sync, persistent reads and provider upserts.
- `.github/workflows/football-sync.yml`: GitHub Actions scheduled at 04:17 and 16:17 UTC (07:17 and 19:17 Uganda), with manual dispatch.

## Required deployment (cannot be performed by downloading a ZIP)
1. Back up your Supabase database. Run `migrations/001_football_cache.sql` in Supabase SQL Editor. Do not rerun `schema.sql` for this upgrade.
2. Create or edit Supabase Edge Function named **football-fixtures**. Paste `football-fixtures.ts` as its `index.ts`, deploy.
3. Set Supabase Edge Function secrets `FOOTBALL_DATA_TOKEN`, `SPORTAPI_KEY`, `FOOTBALL_SYNC_SECRET` (random, at least 32 bytes) and `SUPABASE_SERVICE_ROLE_KEY` (server-side only). Supabase usually supplies `SUPABASE_URL` and anon key automatically. Never put service role or sync secret into website, GitHub source, or Render public environment.
4. In GitHub repository Settings > Secrets and variables > Actions, create `SUPABASE_FUNCTION_URL` (full https://PROJECT.supabase.co/functions/v1/football-fixtures) and `FOOTBALL_SYNC_SECRET` (same secret as Supabase).
5. Supabase Edge Function POST requests may be rejected by JWT verification before code runs. Configure the function to **disable platform JWT verification for this specific function** only if using the `x-football-sync-secret` machine authentication; GET requests still validate JWT inside the function. Alternatively deploy a dedicated sync function with platform JWT verification and an appropriate machine JWT. The secret header must remain private.
6. GitHub Actions > Football fixture sync > Run workflow. Inspect its logs and Edge Function logs. Then log into Foot1X2 and refresh leagues.

## Caveats
- SportAPI.ai response fields and authentication have NOT been validated with a live key. Confirm actual endpoints and plan terms before relying on its coverage.
- A cache miss still invokes the provider through existing GET behavior; once sync runs, cache serves data. Current cached league discovery includes only leagues seen in the sync window for SportAPI.ai.
- football-data.org free tier has rate limits; 12 competition requests per sync can be too many for 10 requests/minute, causing 429 errors. Consider reducing competition batch size or pacing requests; failed leagues are logged and can sync later.
- GitHub Actions schedules may run late or be disabled for inactive repositories; not guaranteed to the minute.
- Data is provider-specific; a match appearing in both providers can appear under both leagues. No fuzzy cross-provider merge is performed because it risks incorrect match associations.
- Predictions require adequate historical completed matches; SportAPI.ai 3-day synchronization does not create sufficient historical coverage by itself.
- Paid redistribution and commercial use of provider data require explicit license verification.
- Existing payment, login, admin and prediction files are preserved, not independently end-to-end tested.
