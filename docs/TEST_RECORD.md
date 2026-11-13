# ShopSmart Test Record

Date: 2026-11-13. Environment: Windows 11, Node.js 24.21.0, local PostgreSQL (`shopsmart` @ localhost:5432), `npm run dev` (frontend http://localhost:5173, API http://localhost:3000). Starting code: commit `b59f17e` plus the team's uncommitted changes.

All customer details are fictional. API evidence was captured with a scripted `fetch` client that prints the status code and JSON body. Rows marked **Team** are browser checks: a team member must run them, write down what appeared, and save the screenshot. Do not fill them in from the API results.

## 1. Baseline (before any fix)

| Check | Observed |
| --- | --- |
| `npm run check` | **Pass.** Frontend lint ✔, backend lint ✔, frontend tests 8/8, backend tests 34/34, Vite build ✔ (1.68 s). |
| `GET /api/health` | 200 `{"status":"ok"}` |
| `prisma migrate status` | 1 migration found, "Database schema is up to date!" |
| Data before testing | 6 products, 5 orders (ids 1–5), 7 order items. Wireless Mouse already at stock 0 from earlier team work. |

### Feature inventory

| Feature | Status |
| --- | --- |
| Product list, details, server search (name **and** description) | Present |
| Category filter and sort (client side) | Present |
| Cart with +/- buttons, quantity input, stock limit, remove | Present (in memory only) |
| Simulated checkout with order review | Present |
| Product assistant with catalog sources | Present |
| **Live AI** (Google Gemini via `@google/genai`, server-side, verified drafts, rule fallback) | **Present**: key configured in `backend/.env` |
| **Authentication / roles** | **Absent**: no sign-in, so the guest/owner/other-customer cases do not apply |

## 2. Customer journey and failure cases

Products used (id: name, price, stock at start): 1 Wireless Mouse ₱650 (0), 2 Compact Mechanical Keyboard ₱1,850 (3), 3 USB-C Study Lamp ₱900 (9), 4 1080p Webcam ₱1,450 (6), 5 Laptop Stand ₱1,200 (9), 6 USB Headset ₱1,350 (7).

### TC-01 Browse and search

| Field | Record |
| --- | --- |
| Starting state | Seeded catalog, app running. |
| Action / data | `GET /api/products`; `?search=keyboard`; `?search=microphone`; `?search=zzzz`; `GET /api/products/2`, `/abc`, `/9999`. |
| Expected | 6 products; keyboard → 1 result; microphone (a description word) → Webcam + Headset; zzzz → empty list; bad id → 400; unknown id → 404. |
| Observed | 200 with 6 products; keyboard → `[2]`; microphone → `[4, 6]`; zzzz → `{"products":[]}`; `/2` → 200; `/abc` → 400 `INVALID_PRODUCT_ID`; `/9999` → 404 `PRODUCT_NOT_FOUND`. |
| Browser (**Team**) | Open http://localhost:5173 → 6 cards. Type `keyboard` → 1 card. Type `zzzz` → message `No products match "zzzz".` Screenshot both. |
| Decision | **Pass** (API). Browser screenshots pending from the team. |

### TC-02 Cart

| Field | Record |
| --- | --- |
| Starting state | Empty cart, fresh page load. |
| Action / data | Add USB-C Study Lamp → open Cart → click **+** twice → type `20` in quantity → click **−** → Add Laptop Stand → Remove Laptop Stand → refresh the page. |
| Expected | Lamp qty 1 = ₱900 → qty 3 = ₱2,700 → typing 20 refused with "Only 9 unit(s) are available." and the quantity stays 3 → qty 2 = ₱1,800 → total ₱3,000 with the stand → ₱1,800 after removal → **refresh empties the cart** (by design: the cart is held in memory). |
| Automated evidence | `frontend/src/utils/cart.test.js`: total, add, stock limit, +/- boundaries all pass (8 tests). |
| Observed (**Team**) | _Record the Items/Total values shown after each step, and screenshot the stock error._ |
| Decision | Unit logic **Pass**. Browser run pending from the team. |

### TC-03 Checkout: valid order

| Field | Record |
| --- | --- |
| Starting state | Stock: lamp 9, stand 9. |
| Action / data | `POST /api/orders` `{"customerName":"Juan Dela Cruz","email":"juan.delacruz@example.com","address":"123 Mabini Street, Barangay Uno, Sample City","items":[{"productId":3,"quantity":1},{"productId":5,"quantity":2}]}` |
| Expected | 201, exactly one order, total ₱900 + 2 × ₱1,200 = ₱3,300 computed by the server, stock lamp −1, stand −2. |
| Observed | **201**, order **#6**, `total: 3300`, items unitPrice 900 / 1200. Stock after: lamp 9 → 8, stand 9 → 7, others unchanged. Repeated in the final smoke test → order **#7**, lamp 8 → 7, stand 7 → 5. |
| Browser (**Team**) | Cart → Proceed to checkout → same fictional details → confirmation page "Thank you, Juan Dela Cruz! … order number #N", cart badge back to 0. Screenshot. |
| Decision | **Pass** |

### TC-04 Checkout: invalid details refused

| Field | Record |
| --- | --- |
| Action / data | (a) email `juan@example`, address `short`; (b) `items: []`. |
| Expected | 422, no order created, and a message the customer can act on. |
| Observed (baseline) | 422 `INVALID_ORDER` but the message was always **"Check the customer and cart information."** In the browser, `juan@example` passes the `type=email` check, so the customer cannot tell which field is wrong → **defect D3**. |
| Observed (after fix) | (a) 422 "Check the email address, delivery address."; (b) 422 "Check the cart items." Order count unchanged. |
| Decision | **Pass after fix D3** |

### TC-05 Stock rule

| Field | Record |
| --- | --- |
| Action / data | (a) order Wireless Mouse ×1 (stock 0); (b) order Keyboard ×19 (stock 3). |
| Expected | 409, no order, no stock change. In the UI, "Add to cart" is disabled for stock 0 and the cart cannot exceed stock. |
| Observed | (a) 409 `INSUFFICIENT_STOCK` "Only 0 unit(s) of Wireless Mouse are available."; (b) 409 "Only 3 unit(s) of Compact Mechanical Keyboard are available."; stock snapshot before = after (`true`). |
| Browser (**Team**) | Wireless Mouse card shows "Out of stock" with a disabled button. Screenshot. |
| Decision | **Pass** |

### TC-06 Assistant: supported question, no match, out of stock

| Question | Observed answer | Sources | answerSource | Decision |
| --- | --- | --- | --- | --- |
| Which keyboard is below ₱2,000? | "The Compact Mechanical Keyboard is available for ₱1,850." | product #2 | ai | Pass: price and product match the catalog |
| Do you sell a refrigerator for the kitchen? | "I could not find an in-stock product matching that request." | none | rules | Pass: honest no match, provider not called |
| Do you have a wireless mouse? (stock 0) | "I could not find an in-stock product matching that request." | none | rules | Pass: does not recommend an unavailable item |
| `hi` (too short) | 422 `INVALID_QUESTION` | – | – | Pass |

### TC-07 Assistant: size number read as a budget → **defect D1**

| Field | Record |
| --- | --- |
| Starting state | Laptop Stand in stock (₱1,200, "for laptops up to 16 inches"). |
| Action | `POST /api/assistant/questions` `{"question":"Do you have a laptop stand that fits up to 16 inches?"}` |
| Expected | Recommends Laptop Stand #5. |
| Observed (baseline) | 200 "I could not find an in-stock product matching that request." No sources. **Fail.** |
| Observed (after fix) | 200 "Yes, we have the Laptop Stand which fits laptops up to 16 inches and costs ₱1,200." source #5, answerSource `ai`. |
| Decision | **Pass after fix D1** |

### TC-08 AI provider failure

| Field | Record |
| --- | --- |
| Action | Started a second API on port 3001 with (a) `GEMINI_API_KEY=` (empty) and (b) `GEMINI_API_KEY=invalid-test-key`, then asked "Which keyboard is below ₱2,000?". |
| Expected | No error and no endless loading; a catalog answer with sources; the server log gives the reason without the key or request details. |
| Observed | (a) 200 in 140 ms, rules answer "Based on the current ShopSmart catalog, consider: Compact Mechanical Keyboard (₱1,850, 3 in stock).", source #2, log `Assistant provider failed (not_configured)`. (b) 200 in 348 ms, same answer, log `Assistant provider failed (unavailable)`. |
| Browser (**Team**) | With an empty key, ask the question → the answer appears with the note "AI drafting is unavailable, so this answer comes directly from the catalog." Screenshot. |
| Automated | `assistant.test.js`: timeout, rate_limit, invalid_format, unavailable, not_configured, plus 11 rejected-draft cases all fall back. |
| Decision | **Pass** |

### TC-09 Assistant rate limit → **defect D2 (part B)**

| Field | Record |
| --- | --- |
| Action | Send assistant questions until the 20-per-minute limit is reached. |
| Expected | 429 with a JSON error that the page displays. |
| Observed (baseline) | 429 `text/html` body "Too many requests, please try again later." The frontend cannot parse it and shows **"Request failed with status 429."** **Fail.** |
| Observed (after fix) | 429 `application/json` `{"error":{"code":"RATE_LIMITED","message":"Too many questions. Please wait a minute and try again."}}` |
| Automated | `backend/test/rateLimit.test.js` (failed before the fix, passes after). |
| Decision | **Pass after fix D2** |

### TC-10 API unavailable → **defect D2 (part A)**

| Field | Record |
| --- | --- |
| Action | Stop the API (Ctrl+C on `npm run dev`, then restart only the frontend with `npm run dev --workspace frontend`), then open Products, ask the assistant, and place an order. |
| Expected | Loading ends; a readable message appears. |
| Observed (baseline, from code and unit test) | `fetch` rejects with `TypeError: Failed to fetch`; the products page showed "Failed to fetch Make sure the backend is running." and the assistant and checkout showed "Failed to fetch". |
| Observed (after fix) | `api.test.js`: a network failure produces "Could not reach the ShopSmart server. Check your connection and try again." (`NETWORK_ERROR`). Loading flags are cleared in `finally` on all three pages. |
| Browser (**Team**) | Repeat with the API stopped and screenshot the message on each page. |
| Decision | **Pass (automated)**. Browser screenshot pending from the team. |

### TC-11 Authentication

Not applicable: authentication is absent. There is no order-read route, so no customer record can be fetched by another customer through the API.

## 3. Defects

| ID | Severity | Reproduction (start → action → actual → expected) | Fix | Test |
| --- | --- | --- | --- | --- |
| D1 | High (incorrect assistant answer) | Laptop Stand in stock → ask "…fits up to 16 inches?" → `parseBudget` reads "up to 16" as a ₱16 budget, filters out every product, and answers "could not find" → should recommend Laptop Stand | `backend/src/services/assistant.js`: a budget number followed by a unit (inches, hours, GB, …) is ignored; the lookaheads prevent capturing part of a number | 3 tests in `backend/test/assistant.test.js` (2 failed before the fix) |
| D2 | Medium (failure message) | API stopped or rate limit reached → UI shows "Failed to fetch" / "Request failed with status 429." → should show an actionable message | `frontend/src/services/api.js` wraps network errors; `backend/src/routes/assistant.js` sends a JSON 429; `ProductsPage.jsx` sentence fix | `frontend/src/services/api.test.js` (network case failed before the fix), `backend/test/rateLimit.test.js` (failed before the fix) |
| D3 | Low (checkout validation feedback) | Valid cart → checkout with `juan@example` → 422 "Check the customer and cart information." → should name the field | `backend/src/routes/orders.js` names the rejected fields; `details` is kept | `backend/test/orders.test.js` |

No test was deleted or weakened.

## 4. Unresolved issues (recorded, not fixed)

| Issue | Impact | Safe temporary limitation |
| --- | --- | --- |
| The cart lives in memory, so a refresh empties it | Customer re-adds items | Documented; the cart is meant for a single session |
| `/api/health` does not query the database | Health shows "ok" while PostgreSQL is down; products then return 500 "The server could not complete the request." | The smoke test checks `/api/products` as well as health |
| The cart keeps a stock snapshot | A stale cart is refused at checkout with 409 and the cart is kept; the customer must lower the quantity manually | The server is the authority; no oversell is possible (transactional decrement) |
| The assistant tie-ranks partial matches ("wireless keyboard" → Wireless Mouse and a wired keyboard) | The suggestion may not meet every requirement | Sources link to the product page with the full description |
| `verifyDraft` rejects any AI answer containing "not available" | An honest AI phrasing falls back to the rule answer | The fallback is still catalog-grounded |
| `npm run db:seed` deletes all orders | Data loss if run on staging | README and the deployment plan forbid it except on an empty DB |

## 5. Final verification (after fixes)

| Check | Observed |
| --- | --- |
| `npm run check` | **Pass.** Lint ✔ ✔, frontend 12/12, backend 41/41, build ✔ (1.73 s) |
| Smoke: health / products / order / assistant | 200 / 6 products / 201 order #7 / 200 grounded AI answer |
| Data survival | Orders 1–5 still present; count 5 → 7 (only the two test orders added); no reseed run |
| Secrets | No `.env` tracked (`backend/.env`, `frontend/.env` ignored); no Gemini key pattern in tracked or new files; `frontend/dist` contains only `http://localhost:3000/api`, with no `DATABASE_URL`, `GEMINI` or password |
| Privacy | Only fictional names (Juan Dela Cruz, `@example.com`) used |
