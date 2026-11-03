# PrepPath E-books Store

Full-stack e-book store you operate yourself: **React + Vite** storefront and admin console, **Node/Express** API, **PostgreSQL** (Neon in production, embedded PGlite locally), **Vercel Blob** file storage, payments by **Razorpay**, email over **SMTP**, server-generated **PDF tax invoices**.
There is no pre-loaded catalogue: you publish your own e-books.

## Run

```bash
npm install
cp .env.example .env      # fill in the values
npm run dev               # API :4000, storefront http://localhost:5173
npm test                  # 14 end-to-end tests (fake Razorpay, temp database)
```

Production: `npm run build && npm start`, or `docker compose up -d --build` (put nginx/Caddy with HTTPS in front).

## Admin console (`/admin`)

| Area | What it does |
|---|---|
| **Dashboard** | Today vs yesterday, revenue by hour, "needs attention" counters, 7/30/90/365-day KPIs and charts, day-by-day report (CSV), live activity feed. Auto-refreshes. Days follow your store timezone. |
| **Books** | Upload cover + the real PDF/EPUB/MOBI/ZIP file (type-checked, max 250 MB). A book cannot be published without its file. |
| **Approvals** | *Payment approval* (hold downloads until you approve; reject = automatic Razorpay refund) and *Invoice approval* (assigns the next sequential invoice number, emails the PDF). Bulk actions. Enable with Settings -> "Require manual approval"; off = fully automatic. |
| **Orders / Invoices** | Search, filters, CSV export, full timeline, invoice PDF, resend email, refunds (real, via Razorpay). |
| **Feedback** | Customer reviews (moderated before going public, "verified buyer" badge) and contact messages. Reply publicly under a review and/or by email. Ratings on books are computed from published reviews only. |
| **Customers** | Searchable list, per-customer profile (orders, spend, downloads, feedback, internal notes), CSV export, privacy erasure (personal data removed, financial records kept anonymised). |
| **Promotions** | Discount codes. |
| **Settings** | Business and tax details (GST name/rate/GSTIN), invoice prefix, approval mode, timezone, currency. |
| **System** | Integration health and warnings, audit log of every admin action, email delivery log, test email, database backup download, change password. |

## Payments (Razorpay)
1. Put `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `.env` (`rzp_test_...` first).
2. Razorpay Dashboard -> Webhooks: URL `https://YOUR-DOMAIN/api/webhooks/razorpay`, events `payment.captured` and `order.paid`, secret = `RAZORPAY_WEBHOOK_SECRET`.
3. Flow: server prices the cart from the database and creates a Razorpay order -> customer pays in Razorpay's window (card data never touches this server) -> server verifies the signature **and** re-fetches the payment from Razorpay (status, order id, exact amount) -> order is fulfilled. The webhook does the same if the customer closes the tab.

## Email
Set `SMTP_*` in `.env`. Sent automatically: payment received / e-books ready (with invoice PDF), invoice, refund, rejection, feedback replies. Every attempt (sent / failed / skipped when SMTP is off) is visible in System -> Email log.

## Security & operations
- Admin sessions: signed HttpOnly cookie, login rate limit, audit log; `SESSION_SECRET` is mandatory in production.
- Rate limits on checkout and feedback, honeypot against bots, CSP + security headers, CSV formula-injection guard, upload type allowlist, parameterised SQL, `/api/health`, graceful shutdown.
- Back up regularly: Neon keeps point-in-time history; **System -> Download data export** gives a JSON copy of every table. For Docker/VPS deployments back up the `/data` volume.

## Deploying on Vercel
1. Project linked to this repo; `api/index.js` + `vercel.json` route `/api/*` to the Express app, the Vite build is served by the CDN.
2. Add a Postgres database (Vercel Marketplace -> Neon) so `DATABASE_URL` is set, and a private Blob store (`vercel blob create-store NAME --access private`).
3. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `PUBLIC_URL`, Razorpay, Google and SMTP variables in Project -> Settings -> Environment Variables.
4. E-books upload straight from the admin browser to Blob (serverless request bodies are capped at 4.5 MB) and are streamed only to paying customers.
The app refuses to start on Vercel without `DATABASE_URL` so orders can never be lost to an ephemeral disk.

## Known limits (be aware before scaling)
- Rate limits and admin login throttling are in-memory per serverless instance (best-effort); put Vercel Firewall rules in front for strict limits.
- Single admin role (no staff permissions yet). Rate limits are in-memory (per process).
- Prices are exclusive of tax; the configured rate is added at checkout.
- Live Razorpay/SMTP behaviour is covered by tests against a fake Razorpay and skipped email only; do a real test-mode purchase and test email before launch.

## Customer accounts: Sign up, Log in, Google
The header has **Log in** and **Sign up** buttons.
- **Sign up** (`/signup`): name, email, password (min. 8 chars, scrypt-hashed). A confirmation link is emailed (needs SMTP). Customers can also sign up with Google.
- **Log in** (`/login`): email + password, or Google. `/forgot` and `/reset` handle password resets by emailed one-hour, single-use link.
- Accounts with the same email (password + Google) are merged into one.
- **Order history** shows purchases made while logged in; once the email is confirmed it also shows earlier purchases made as that email. This stops someone registering with another person's address to see their orders.
- Protections: per-IP and per-account throttling (8 failures lock an account for 15 min), no account enumeration on login/reset, token links are single-use and stored hashed, password hashes are never returned or exported.
- Guest checkout stays available; `REQUIRE_LOGIN_TO_BUY=true` requires an account.

### Sign-in with Google
Shoppers can sign in with Google (header button, checkout, reviews, `/account` with order history and re-downloads). The admin panel keeps its own email + password login; Google is never used for it, and a customer session can never access admin routes.
1. Google Cloud Console -> APIs & Services -> Credentials -> **Create OAuth client ID** -> *Web application*.
2. Add your site URL (and `http://localhost:5173`, `http://localhost:4000` for local testing) to **Authorised JavaScript origins**. No redirect URI is needed.
3. Put the client ID in `GOOGLE_CLIENT_ID`. The button appears automatically.
4. Guest checkout stays available; set `REQUIRE_LOGIN_TO_BUY=true` to require sign-in before paying.
The server verifies Google's ID token itself (signature, audience, issuer, expiry, verified email) and signed-in purchases are always bound to the verified Google email.
