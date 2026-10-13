# Foot1X2 — Production-hardening foundation

This release preserves the existing Foot1X2 single-page experience, customer marketplace, administrator controls, historical prediction tools, fixture fetching, and the existing payment integration source. It is **not certified production-ready** without completing the checks below.

## Deploy
1. Host `index.html` and `config.js` at the same origin, over HTTPS. Edit `config.js` with your real Supabase project URL and **publishable/anon** key. These are public identifiers, never a service-role key. Customers no longer need to configure Supabase per browser.
2. Apply `schema.sql` to a **staging Supabase project** first. It contains multiple bundled schema sections originally supplied by the application; review migration order and existing object dependencies before using it on a populated database. Back up production data.
3. Deploy `football-fixtures.ts` as `football-fixtures` and set `FOOTBALL_DATA_TOKEN` as a server secret. It currently requires an authenticated Supabase session and may be limited by the provider plan. Do not put this token in the browser.
4. Deploy `pesajet-checkout.ts` and `pesajet-webhook.ts` only after confirming the exact SDK version, request/response formats, signing algorithm, webhook authenticity and idempotency with **official PesaJet documentation and sandbox tests**. Their source is preserved, **not certified**. Never manually mark a payment paid based on the browser callback.
5. Provision the first Super Admin by a privileged database operation. Verify `is_super_admin()` and all RLS policies using a separate non-admin test account. Never rely on CSS hiding for authorization.
6. Configure the host to serve the `_headers` security headers (Netlify syntax; adapt for Render/other hosting). Add an appropriate Content Security Policy after auditing existing external script dependencies.
7. Check production domain, email confirmation, password reset, account deletion, monitoring, backups, payment disputes, rate limiting, provider quota, privacy policy, and customer support.

## Prediction engine
The automated fixture estimator now uses home-only and away-only historical results, excludes matches played after each fixture's kickoff, exponentially weights recent results (90-day half-life), regularizes sparse scoring averages toward competition baselines (six pseudo-matches), and calculates a normalized Poisson/Dixon–Coles-style score grid. This is a defensible baseline, **not evidence of superior accuracy**. Its low-score correction is a fixed preset, not fitted from historical data. No bookmaker odds, injury reports, lineups or xG are fetched. Matches with fewer than five relevant historical games per side or fewer than 20 completed league games are excluded.

## Required validation before public launch
- Backtest on out-of-sample past seasons with chronological train/test splits, log loss, multiclass Brier score, calibration curves and draw-class calibration; compare to simple league baseline and market odds where licensed.
- Validate RLS with unauthorized direct API calls for draft tips, paid analysis, orders and administrative writes.
- End-to-end test registration, login, password recovery, free tips, purchase initiation, verified webhook settlement, duplicate webhook, cancelled/failed payment, refunds, entitlement expiry and suspended tips.
- Test football API provider quotas, incomplete competitions, postponed/cancelled fixtures and stale cached data.
- Do not advertise guaranteed draws or guaranteed financial returns.

## Compatibility
The embedded Supabase and PesaJet backend sources are retained; exported copies are included for convenient review. Existing customer/admin UI elements and payment flow are retained. `config.js` is a new required deployment file for zero-configuration customer onboarding; if left as placeholders, the previous browser-local configuration fallback remains available.
