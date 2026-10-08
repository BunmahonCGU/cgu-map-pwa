# V2 test site setup (historical replay)

V2 runs separately from the live app until it's merged. The live app is
not touched by any of this.

| | Live (V1) | V2 test |
| --- | --- | --- |
| App | GitHub Pages from `main`: https://bunmahoncgu.github.io/cgu-map-pwa/ | Served by the V2 Worker itself |
| Server | Worker `shiny-math-8471` (set up by hand) | Worker `cgu-map-v2`, built from the `v2-replay` branch |
| Data | Live KV store and Durable Object | Its own KV store and Durable Object |

The V2 Worker serves both the app's files and its API from one address,
`https://cgu-map-v2.bunmahoncgu.workers.dev`. Everything it needs (Durable
Object, KV store, which files to serve) is described in `wrangler.jsonc` in
the repo, so Cloudflare sets it up on the first deploy. The only thing to
add by hand is the admin PIN.

Checked against Cloudflare's docs as of October 2026. If a label differs on
screen, the step order still applies.

## 1. Create the Worker from GitHub (once)

1. In the Cloudflare dashboard, open **Workers & Pages** and select
   **Create application**.
2. Next to **Import a repository**, select **Get started**.
3. Pick your GitHub account and the `BunmahonCGU/cgu-map-pwa` repository.
4. On the configure screen:
   - **Project / Worker name:** `cgu-map-v2` (must match `wrangler.jsonc`, or the build fails)
   - **Build command:** leave empty
   - **Deploy command:** leave the default, `npx wrangler deploy`
   - **Root directory:** leave empty
   - **Branch:** `v2-replay`, if the screen offers a branch choice
5. Select **Save and Deploy**.

The import screen usually doesn't offer a branch, so the first build runs
from `main`. Main has no `wrangler.jsonc`, so Cloudflare deploys the repo as
a files-only site, and the dashboard says bindings can't be added to an
application with only static assets. That's expected and fixed by the next
build:

6. Open the new application, go to **Settings → Build**, set the
   **Git branch** to `v2-replay`, and save. Check the deploy command is
   `npx wrangler deploy`.
7. Note the application's name at the top of the page. It must match
   `"name"` in `wrangler.jsonc` (`cgu-map-v2`); if it differs, ask Claude to
   change `wrangler.jsonc` to match.
8. Go to **Deployments** and select **Retry build** on the latest build (or
   ask Claude to push a small change to `v2-replay`). This build deploys the
   real Worker, with its Durable Object and KV store, and the static-only
   message goes away.

From then on, every push to `v2-replay` rebuilds and redeploys V2.

## 2. Add the admin PIN (once)

If the first build ran from `main`, the dashboard keeps treating the Worker
as static-only and refuses runtime variables ("Variables cannot be added to
a Worker that only has static assets"), even though the Worker code runs.
So the build sets the secret instead:

1. Open the Worker, go to **Settings → Build → Variables and secrets**, and
   add a **Secret** named `ADMIN_PIN` with the PIN to use on V2.
2. In **Settings → Build**, set the **Deploy command** to:

   ```
   npx wrangler deploy && printf '%s' "$ADMIN_PIN" | npx wrangler secret put ADMIN_PIN
   ```

3. Retry the latest build (or push to `v2-replay`). Every build now copies
   the PIN onto the running Worker. To change the PIN, change the build
   secret and rebuild.

If the dashboard does let you add runtime secrets, adding `ADMIN_PIN` under
**Settings → Variables and Secrets** works too, and the deploy command can
stay `npx wrangler deploy`.

Optional: a `GITHUB_TOKEN` secret, set up the same way, only needed for the admin
panel's token health line. Without it, that line shows a warning on V2.

## 3. Check it

- Open https://cgu-map-v2.bunmahoncgu.workers.dev (the exact address is on
  the Worker's overview page).
- In **Settings → Bindings** you should see `LIVE_USERS_DO` (Durable Object)
  and `ALERTS_KV` (KV namespace). Both were created by the first deploy.
- **Admin → Historical Replay → Replay demo history** works straight away.
- **Replay recorded history** shows what V2 has archived: every update
  posted or deleted, and everyone's position every 30 seconds while anyone
  is sharing location. History is kept 30 days (`ARCHIVE_RETENTION_DAYS`
  in `worker-updated.js`).

Free-plan limits (100,000 requests a day, etc.) are per Cloudflare account,
so V2 testing shares them with the live app.

## 4. Going live later

1. Merge `v2-replay` into `main`, so GitHub Pages serves V2.
2. Update the live Worker `shiny-math-8471` with the V2 `worker-updated.js`
   the same way it's been updated before. It starts archiving from then on.
3. Optionally delete the `cgu-map-v2` Worker once V2 is live.
