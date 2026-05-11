# Deployment Guide

## TL;DR

```bash
# Build
docker build -t research-center:latest .

# Run (single instance, named volume for persistent data)
docker run -d \
  --name research-center \
  -p 3000:3000 \
  --env-file .env.production \
  -v rc-data:/app/data \
  research-center:latest
```

Healthcheck endpoint: `GET /api/health` (public, no auth, returns 200 if process is up).

## Required env vars

See `.env.production.example`. Minimum to start:

- `AUTH_SECRET` (32+ chars)
- `AUTH_BASE_URL` (e.g. `https://research.your-domain`)
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
- `ALLOWED_EMAIL_DOMAIN` (or `ALLOWED_EMAILS`)
- `EDITOR_EMAILS`
- `GEMINI_API_KEY`

Optional but commonly needed: `FIRECRAWL_API_KEY`, `GOOGLE_DRIVE_API_KEY`, `CRON_SECRET`.

**Never set `AUTH_DEV_BYPASS=1` in production** — it bypasses auth.

## Google OAuth setup

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client (Web application)
2. Authorized redirect URI: `<AUTH_BASE_URL>/api/auth/google/callback`
3. OAuth consent screen → Internal (restricts to your Workspace org)
4. Copy client ID + secret into env vars

## Data directory layout

The container writes to `/app/data`:

```
/app/data
├── store/                      JSON stores (auth, audit, quota, snapshots)
│   ├── documents.json
│   ├── personas.json
│   ├── audit-log.ndjson        append-only
│   ├── user-quota.json         daily reset
│   ├── issue-trends.json
│   └── ...
└── files/                      raw uploads + extracted text
    ├── report/
    ├── survey/
    ├── transcript/
    ├── survey-monthly/
    └── chat-images/
```

`/app/data` is declared as a `VOLUME` in the Dockerfile. **Mount a persistent volume here** (named volume, PVC, NFS, EFS, Azure Files), otherwise everything is lost on container restart.

## Multi-instance considerations

Current data layer is **file-based** (JSON / NDJSON on local disk). This works for **a single instance**. If you scale to multiple replicas:

| Issue | Mitigation |
|---|---|
| Concurrent writes corrupt JSON | (a) Stick to 1 replica + put HA at the LB, OR (b) migrate stores to Postgres / Redis |
| Uploads only on the receiving pod | Mount a shared volume (NFS / EFS) across pods OR migrate file storage to object storage (S3 / GCS) |
| Audit log split across pods | Centralize log shipping (Logflare / Loki / stdout → cluster log agg) |
| Quota counters per pod | Move to Redis (atomic INCR) instead of local JSON |

Recommended initial deployment: **1 replica + horizontal LB later** if traffic warrants. Even at peak internal usage this should be enough for hundreds of viewers.

## Build size & cold start

- Build context: ~600 MB (mostly node_modules — `npm ci` produces them)
- Final image: ~150 MB (alpine + next standalone)
- Cold start: ~2-3 sec on a modern host

## CRON / scheduled tasks

`/api/social/cron` exists for periodic social fetch. To wire it up:

- **Vercel Cron** (if you ever route a part there): set `CRON_SECRET`, add to crons config
- **K8s CronJob**: `curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/social/cron` on a `0 */6 * * *` (every 6h) schedule
- **External scheduler**: any HTTP scheduler can hit the URL with the bearer token

## Backup

The whole state lives under `/app/data`. Snapshot the volume on whatever cadence fits (daily is fine for a research tool).

```bash
# Example: rsync nightly to backup host
docker run --rm \
  -v rc-data:/data:ro \
  -v /backup:/backup \
  alpine \
  tar czf /backup/research-center-$(date +%F).tar.gz -C /data .
```

Restore = stop container, untar into the named volume, start.

## Troubleshooting

| Symptom | Check |
|---|---|
| 502 from LB | Container healthcheck — `curl localhost:3000/api/health` from inside |
| All requests 401 | `AUTH_SECRET` mismatch across replicas (each instance must share the same secret) |
| OAuth callback fails | `AUTH_BASE_URL` doesn't match what Google redirects to → check Google Console authorized redirect URI |
| Uploads disappear after restart | Volume not mounted at `/app/data` |
| Quota always 0 | Container is read-only or `data/` isn't writable by uid 1001 |

## Production checklist

- [ ] OAuth client created + authorized redirect URI set
- [ ] All required env vars in secret manager (not .env file in image)
- [ ] HTTPS terminated at LB (Secure cookie flag depends on it)
- [ ] Persistent volume mounted at `/app/data`
- [ ] Healthcheck wired into LB / orchestrator
- [ ] Log shipping configured (stdout → wherever)
- [ ] Backup schedule for `/app/data`
- [ ] `CRON_SECRET` set if scheduled fetch is needed
- [ ] `AUTH_DEV_BYPASS` is NOT set anywhere in production env
- [ ] Verified `/api/auth/google/start` redirects to Google (not 500)
- [ ] Real OAuth flow tested end-to-end with a Workspace account
