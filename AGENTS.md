# AGENTS.md

## Project Overview

WA Auto Block — a private WhatsApp auto-block bot. Node.js/Express server serves a web dashboard on port 3000 and uses the Baileys library (`@whiskeysockets/baileys`) to connect to WhatsApp via QR-code login. It auto-blocks unknown numbers that message or call the connected account.

## Setup Quirks

- **Baileys needs git + CA certs + SSH→HTTPS rewrite**: The `@whiskeysockets/baileys` package has a transitive dependency (`libsignal-node`) fetched via an SSH git URL (`ssh://git@github.com/...`). The `node:20-slim` base image lacks `git`, `openssh-client`, and `ca-certificates`, and SSH access to GitHub is unavailable. The compose command installs these and rewrites SSH GitHub URLs to HTTPS via `git config --global --replace-all` + `--add` (idempotent across container restarts).
- **No package-lock.json**: `npm install` resolves dependencies fresh each boot.
- **No external credentials needed**: WhatsApp auth is QR-based (user scans with their phone). The frontend renders the QR via the public `api.qrserver.com` API — no API key required.
- **Auth state persistence**: WhatsApp session creds are stored in `data/auth/` (a named Docker volume `auth_data` in compose) so the session survives container restarts.

## Running

```bash
docker compose -f docker-compose.base44.yml up -d
```

The container runs `node --watch src/server.js` for live reload on source changes. Dependencies reinstall on each container start (no lock file).

## Verification

- `curl http://localhost:3000/` → HTML dashboard (HTTP 200)
- `curl http://localhost:3000/api/status` → `{"connected":false,"number":null,"state":"waiting_qr"}`
- The dashboard polls `/api/status` and `/api/qr` every 2 seconds, displaying a QR code for WhatsApp login.
