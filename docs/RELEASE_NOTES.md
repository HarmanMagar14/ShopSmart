# ShopSmart Release Notes

## Version and date

- Version: 1.0.0 release candidate, 2026-11-13
- Code: commit `<fill in after committing>` (based on `b59f17e` with the team's changes and the fixes below)
- **Deployment status: local release candidate only. Live staging was not completed** because no hosting was approved. See `docs/DEPLOYMENT_PLAN.md` for the planned Render setup.

## Working features (verified 2026-11-13; see `docs/TEST_RECORD.md`)

- Product catalog, product details, and search on name and description, with a "No products match" state
- Category filter and price/name sort
- Cart: add, +/- buttons, typed quantity, remove, stock limit, correct item count and total
- Simulated checkout: the server computes the total, decrements stock in a transaction, refuses invalid details (422, now naming the fields), and refuses out-of-stock or over-stock quantities (409) without changing stock
- Product assistant: Gemini drafts an answer; every price, product and stock claim is verified against the catalog; sources link to product pages; there is an honest no-match answer; provider failures (no key, bad key, timeout, rate limit, bad output) fall back to a catalog answer
- Readable failure messages when the API is unreachable or the assistant limit is reached
- `/api/health`

## Fixes in this release

| ID | Fix |
| --- | --- |
| D1 | The assistant no longer reads a size such as "up to 16 inches" as a ₱16 budget (it previously answered "no match" for the Laptop Stand) |
| D2 | "Failed to fetch" and "Request failed with status 429." replaced by actionable messages; the assistant rate limit now returns JSON |
| D3 | Rejected checkouts name the fields to correct |

## Known limitations

- **Authentication: absent.** Orders are not linked to customers. There is no order history, and there are no admin product routes.
- **Cart:** held in memory, so a page refresh empties it. The stock shown in the cart may be stale; checkout re-checks and refuses with 409.
- **AI:** needs `GEMINI_API_KEY` in `backend/.env`; without it, catalog-only answers are given. Partial matches can be suggested ("wireless keyboard" → Wireless Mouse). A truthful AI answer containing "not available" is replaced by the catalog answer. Limit: 20 questions per minute per client.
- **Health check** does not test the database.
- **Hosting:** Render staging in progress; until the staging smoke test passes, this is a local release candidate.
- **Data:** `npm run db:seed` deletes all orders, so never run it on a database you need.

## Local startup

Follow `README.md` from the project root:

1. Create the PostgreSQL user and database (README §D).
2. `Copy-Item backend\.env.example backend\.env` and `Copy-Item frontend\.env.example frontend\.env`.
3. **Optional extra config added by this team:** put a Gemini key in `GEMINI_API_KEY=` in `backend/.env`; leave it empty for catalog-only answers.
4. `npm install`, `npm run db:generate`, `npm run db:migrate`, then `npm run db:seed` (first time only).
5. `npm run check` (expected: lint ✔, 12 frontend + 41 backend tests pass, build ✔).
6. `npm run dev`, then open http://localhost:5173 and http://localhost:3000/api/health.

## Final local smoke test (2026-11-13)

| Check | Result |
| --- | --- |
| `npm run check` | Pass (frontend 12/12, backend 41/41, build ✔) |
| Health | 200 `{"status":"ok"}` |
| Products | 6 loaded from PostgreSQL |
| Simulated checkout (Juan Dela Cruz, fictional) | 201, order #7, total ₱3,300 |
| Assistant | Grounded AI answer with source #2; fallback verified with an empty or invalid key |
| Data survival | Orders 1–5 kept; no reseed |
| Secrets | No `.env` or key in the repo or `frontend/dist` |

## Team record

| Member | Test they ran | Contribution | Issue they can explain |
| --- | --- | --- | --- |
| _Name_ | _e.g. TC-05 Stock rule_ | _e.g. D1 fix and tests_ | _e.g. why "up to 16 inches" became a ₱16 budget_ |
| _Name_ | _e.g. TC-08 AI provider failure_ | _e.g. D2 frontend error handling_ | _e.g. why fetch shows "Failed to fetch"_ |
| _Name_ | _e.g. TC-03/04 Checkout_ | _e.g. deployment plan and diagram_ | _e.g. migrate deploy vs migrate dev / seed risk_ |
| _Name_ | _e.g. TC-02 Cart (browser)_ | _e.g. test record and screenshots_ | _e.g. why VITE_ variables cannot hold secrets_ |
