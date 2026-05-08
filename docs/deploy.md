# Deployment

This document walks through running the gateway in production with Docker
Compose. Three containers — Caddy (TLS termination), the Next.js app, Postgres
— on a single host.

## 1. Prerequisites

- Docker Engine 24+ with Compose v2 (`docker compose ...`).
- A DNS A/AAAA record for `${DOMAIN}` pointing at the host's public IP.
- Ports 80 and 443 open inbound (Caddy uses both for ACME HTTP-01 and serving).
- Ability to run a one-off command inside the app container (`pnpm genkey`) to
  generate the four 32-byte secrets.

## 2. Generate secrets

```bash
# From a development checkout (or any node 22+ environment):
pnpm install
pnpm genkey   # prints one base64 32-byte key. Run 5×, label each.
```

You need five distinct keys:

| Variable                  | Purpose                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`      | Better Auth session signing key. Rotate with care.           |
| `MASTER_KEY_ENC_KEY`      | AES-256-GCM key encrypting Weeek master tokens at rest.       |
| `FINGERPRINT_HMAC_PEPPER` | HMAC pepper for workspace fingerprint + audit IP hash.       |
| `SUB_KEY_HMAC_PEPPER`     | HMAC pepper for sub-key hashing. Rotation invalidates keys. |
| `CRON_SECRET`             | Bearer for `/api/cron/audit-retention`.                      |

Plus a strong `POSTGRES_PASSWORD` (any high-entropy string).

## 3. Configure the host

```bash
git clone https://github.com/your-org/weeek-api-permissions.git
cd weeek-api-permissions
cp .env.docker.example .env
$EDITOR .env  # paste DOMAIN, ACME_EMAIL, BETTER_AUTH_URL, secrets, POSTGRES_PASSWORD
chmod 600 .env
```

`BETTER_AUTH_URL` MUST be `https://${DOMAIN}` — Better Auth uses it for
session cookie scope and OAuth redirect URIs.

## 4. Bring the stack up

```bash
docker compose up -d --build
docker compose logs -f app
```

On first boot the entrypoint runs `drizzle-kit migrate`. Subsequent restarts
re-run migrations idempotently. Set `RUN_MIGRATIONS=0` in the env to skip
(useful for read replicas).

Caddy obtains a Let's Encrypt cert automatically. Watch `docker compose logs
caddy` for the ACME handshake (typically 5–30 seconds).

## 5. Smoke checks

```bash
curl -fsS https://${DOMAIN}/healthz
# {"status":"ok"}

curl -fsS https://${DOMAIN}/readyz
# {"status":"ready","checks":{"db":"ok","crypto":"ok"}}
```

A 503 from `/readyz` with `checks.crypto != "ok"` means `MASTER_KEY_ENC_KEY`
is missing or not a 32-byte base64 string. A 503 with `checks.db != "ok"`
means the app cannot reach Postgres.

## 6. First admin

The very first sign-up becomes the only owner of their workspace. Visit
`https://${DOMAIN}/sign-up` and create an account. Optionally configure
Google OAuth by populating `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in
`.env` and restarting (`docker compose up -d app`); the authorised redirect
URI is `https://${DOMAIN}/api/auth/callback/google`.

## 7. Cron — audit retention

Old audit rows are deleted by hitting the cron route with the `CRON_SECRET`:

```bash
# Add to /etc/cron.d/wgw-audit (host crontab) — runs at 03:17 daily:
17 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://${DOMAIN}/api/cron/audit-retention >/dev/null
```

Or use any external scheduler (GitHub Actions, Cloudflare Workers Cron, k8s
CronJob — the route is just an authenticated HTTP endpoint).

## 8. Logs & rotation

Both the app and Caddy emit JSON to stdout. Docker rotates logs via
`/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" }
}
```

Restart the Docker daemon after editing.

## 9. Backups

Postgres data lives in the named volume `pgdata`. Back it up with whatever
fits your operations posture:

```bash
docker compose exec -T postgres pg_dump -U app weeek_perm | gzip > backup.sql.gz
```

The encrypted master keys in `weeek_workspace.master_key_*` are useless
without `MASTER_KEY_ENC_KEY`. Treat the env file (`.env`) as a separate
secret to back up, and rotate it independently of database snapshots.

## 10. Updates

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on the new container's first boot. Zero-downtime
upgrades require a load balancer in front of two replicas — not in scope for
this single-host compose layout.
