# Atlas sync service

A small Cloudflare Worker that lets Atlas sync your progress between devices. It stores one **encrypted**
copy per sync code in a Cloudflare D1 database. It can't read your data: the encryption key is worked out
from your sync code on your own devices and never leaves them.

It runs on Cloudflare's **free plan**. The free limits that matter (checked November 2026):

| Limit (free plan) | Amount | What Atlas uses |
|---|---|---|
| Worker requests | 100,000 a day | One check every 45 seconds while Atlas is open, plus uploads and pairing |
| D1 rows written | 100,000 a day | One per upload (at most one every 15 seconds per device), plus a few per pairing |
| D1 row size | 2 MB | One encrypted, compressed copy per sync code (usually well under 200 KB) |
| D1 database size | 500 MB | Enough for thousands of learners |

If a daily limit is used up, sync pauses until midnight UTC. Nothing is lost: each device keeps its data
and syncs once the service answers again.

## Where it runs now

Deployed on 24 November 2026 to **https://atlas-sync.marva-abouei.workers.dev** (Worker `atlas-sync`, D1
database `atlas-sync`, both on Marva's Cloudflare account). `js/sync-config.js` points Atlas there.
Health check: https://atlas-sync.marva-abouei.workers.dev/health

To update the service after changing `src/index.js`: `cd sync-worker && npx wrangler deploy`, or paste the
new code into the Worker in the Cloudflare dashboard.

## Deploy it (once, about 15 minutes)

You need a free Cloudflare account. Either way below works.

### Option A: from the command line

```bash
cd sync-worker
npx wrangler login                                   # opens the browser to sign in to Cloudflare
npx wrangler d1 create atlas-sync                    # prints a database_id
# Paste that database_id into wrangler.toml, replacing REPLACE_WITH_DATABASE_ID.
npx wrangler d1 execute atlas-sync --remote --file=schema.sql
npx wrangler deploy                                  # prints https://atlas-sync.<your-subdomain>.workers.dev
```

### Option B: in the Cloudflare dashboard (no command line)

1. **Storage & Databases → D1 → Create database.** Name it `atlas-sync`.
2. Open the database, choose **Console**, paste the contents of `schema.sql` and run it.
3. **Workers & Pages → Create → Create Worker.** Name it `atlas-sync` and deploy the starter.
4. **Edit code**, replace everything with the contents of `src/index.js`, and deploy.
5. In the Worker's **Settings → Bindings**, add a **D1 database** binding named `DB` pointing to `atlas-sync`.
6. In **Settings → Variables and secrets**, add `ALLOWED_ORIGINS` = `https://marva-a.github.io`
   (and `ALLOW_LOCALHOST` = `true` if you also run Atlas on your own computer).
7. Copy the Worker's address (`https://atlas-sync.<your-subdomain>.workers.dev`).

### Then connect Atlas to it

Put the address in `js/sync-config.js`:

```js
export const SYNC_URL_DEFAULT = 'https://atlas-sync.<your-subdomain>.workers.dev';
```

Publish Atlas as usual. **Settings → Data → Sync across your devices** now offers sync.

To check the service: open `https://atlas-sync.<your-subdomain>.workers.dev/health`. It should show `{"ok":true}`.

## Try it without Cloudflare

```bash
node --no-warnings sync-worker/dev/server.mjs     # the Worker on http://127.0.0.1:8787, with SQLite standing in for D1
node scripts/serve-local.mjs                      # Atlas on http://localhost:8095
```

In Atlas, open the browser console and run
`localStorage.setItem('identity-lab-coach:sync-url', 'http://127.0.0.1:8787')`, then reload.
This override only works on `localhost`.

## Checks

```bash
node --no-warnings sync-worker/test.mjs   # the service: access keys, conflicts, size limits, which sites may call it
node js/sync-selftest.js                  # the app side: merging, deletions, test mode, encryption
```

## How it protects your data

- **No accounts.** The service doesn't know who you are. A vault is found by an id worked out from your
  sync code; the code itself is never sent.
- **Encrypted on your device.** AES-GCM with a 256-bit key, also worked out from the code. The service stores
  only locked data, a revision number and a SHA-256 hash of the access key.
- **Pairing with a short code.** "Show a code" leaves a one-time public key (ECDH P-256) under a hash of
  an 8-digit code for ten minutes; the device that types the code encrypts the sync code to that key. The
  service only sees public keys and locked data. It does have to pass the public keys along honestly: a
  dishonest operator could intercept a pairing. The QR code method never goes through the service.
- **No overwriting.** Every upload says which revision it was based on. If another device uploaded first,
  the upload is refused, and Atlas downloads, merges and tries again.
- **What it cannot protect against.** Anyone who has your sync code (or the pairing link or QR code) can read
  and change your synced data, so treat it like a password. If you lose every device *and* the code, the
  cloud copy can't be unlocked by anyone, including you. Keep an occasional backup file as well.
- **Known limitation.** Anyone can create new vaults, so someone could use up the free daily limits on
  purpose. That would pause sync for a day; it can't expose or change anyone's data.
