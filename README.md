# Tabadol (تبادل): full project for Cloudflare

Front end: `public/index.html` (one page). Back end: `functions/api/[[path]].js` (Cloudflare Pages Functions).
Database: Cloudflare D1 (`schema.sql`). Members sign up with username, email, password, city, optional phone and profile photo.

## Deploy (about 15 minutes, no terminal needed)
1. **GitHub:** create a repository and upload everything in this folder (keep the folders `public` and `functions`).
2. **Database:** Cloudflare dashboard > Storage & databases > D1 > Create database, named `tabadol`.
   Open it, go to the **Console** tab, paste the whole content of `schema.sql`, run it.
   Copy the **Database ID** and paste it in `wrangler.toml` (replace `PASTE-YOUR-D1-DATABASE-ID-HERE`), commit on GitHub.
3. **Site:** Workers & Pages > Create > Pages > Connect to Git > choose the repository.
   Framework preset: None. Build command: leave empty. Build output directory: `public`. Deploy.
4. If the site says "Erreur du serveur", open the Pages project > Settings > Bindings and check a D1 binding named `DB` points to `tabadol`.
5. **Domain:** Pages project > Custom domains > add your domain.

## Before opening to the public
- Cloudflare dashboard > Security > WAF > Rate limiting: limit `/api/login` and `/api/signup` (for example 10 requests per minute per IP).
- There is no email verification and no password reset yet. Add an email service (for example Resend) for both.
- Wishlists are visible to logged-in members, because matching runs in the browser.
- Photos are stored in the database (resized to small JPEGs). Move them to Cloudflare R2 if you grow.
- Declare to the CNDP (law 09-08) and publish terms and a privacy policy before collecting real members.
- Test with two accounts: add books and wishes on both, then propose and accept a swap.
