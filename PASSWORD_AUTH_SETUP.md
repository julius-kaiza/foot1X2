# Foot1X2: Password sign-up without email confirmation

Supabase Dashboard → Authentication → Providers → Email: keep Email enabled, disable Confirm Email, and save. New accounts may then receive a session immediately after signUp. The frontend uses Supabase auth.signUp({email,password}) and auth.signInWithPassword({email,password}); it does not send email itself.

Set Authentication → URL Configuration → Site URL to the deployed HTTPS Render URL. Existing unconfirmed accounts may need administrative review; disabling Confirm Email does not necessarily retroactively verify them. Do not use service-role keys in the browser.

Security: Unverified email ownership enables impersonation and account recovery problems. Consider CAPTCHA, secure passwords, rate limiting, and enabling email confirmation before public launch. This change does not disable Supabase API rate limits or password-reset emails.

Deployment: replace files in GitHub and redeploy Render. Supabase settings must be changed manually by the project owner. No database schema changes needed.
