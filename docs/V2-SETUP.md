# V2 test site setup (historical replay)

V2 runs separately from the live app until it's merged:

| | Live (V1) | V2 test |
| --- | --- | --- |
| App | GitHub Pages, `main` branch, https://bunmahoncgu.github.io/cgu-map-pwa/ | Cloudflare Pages, `v2-replay` branch |
| Worker | `shiny-math-8471` | `cgu-map-v2` (its own Durable Object, KV and PIN) |

The app picks its Worker by address: on `bunmahoncgu.github.io` it uses the
live Worker, anywhere else it uses `V2_TEST_WORKER` in `js/map.js`.

## 1. Create the V2 Worker

1. Cloudflare dashboard: **Workers & Pages → Create → Worker**. Name it
   `cgu-map-v2`, so its address is `https://cgu-map-v2.bunmahoncgu.workers.dev`
   (if it ends up different, change `V2_TEST_WORKER` in `js/map.js`).
2. **Edit code**: replace everything with `worker-updated.js` from the
   `v2-replay` branch, then **Deploy**.
3. **Settings → Bindings**, the same way the live Worker is set up:
   - Durable Object: variable `LIVE_USERS_DO`, class `LiveUsersDO`.
   - KV namespace: create a new one (e.g. `cgu-alerts-v2`) and bind it as `ALERTS_KV`.
4. **Settings → Variables and Secrets**:
   - Secret `ADMIN_PIN` (same as live or a test PIN).
   - Text variable `EXTRA_ORIGINS` = the Pages address from step 2 below,
     e.g. `https://cgu-map-v2.pages.dev`.
   - Optional: `GITHUB_TOKEN`, only needed for the token health check.

## 2. Create the V2 Pages site

1. **Workers & Pages → Create → Pages → Connect to Git**, choose
   `BunmahonCGU/cgu-map-pwa`.
2. Project name e.g. `cgu-map-v2`. **Production branch: `v2-replay`**.
   Framework preset: None. Build command: empty. Output directory: `/`.
3. Every push to `v2-replay` redeploys it.

## 3. Try it

- Open the Pages address, set a name and share location as normal.
- **Admin → Historical Replay → Replay demo history** works straight away.
- **Replay recorded history** shows what the V2 Worker has archived: alert
  posts and deletes, plus everyone's position every 30 seconds while anyone
  is sharing. History is kept 30 days (`ARCHIVE_RETENTION_DAYS` in the Worker).

Free-plan limits (100,000 requests a day, etc.) are per Cloudflare account,
so V2 testing shares them with the live app.

## 4. Going live later

1. Merge `v2-replay` into `main` (GitHub Pages then serves V2).
2. Paste the V2 `worker-updated.js` into the live Worker (`shiny-math-8471`)
   and deploy; it starts archiving from then on.
