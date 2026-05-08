# Pivo

<img src="public/pivo-logo.svg" alt="Pivo" width="180">

A self-hosted Plex newsletter that actually looks good. Pulls recently added media (and optional watch stats) from your Tautulli instance and sends a clean, branded HTML email to your subscribers on whatever schedule you want.

> **pivo** — Czech for *beer*. Same vibe as the rest of the self-hosted Plex stack (Sonarr, Tautulli, Overseerr): something you set and forget, then enjoy.

## Features

- **Looks good** — MJML-based email template renders consistently in Gmail, Apple Mail, Outlook, and most clients.
- **Branding** — upload a logo, set an accent color, and add custom HTML in the header and footer.
- **Recently added** — movies, TV (grouped by show with episode lists), and optionally music albums.
- **Optional sections** — most-watched movies/TV, top viewers, and aggregate plays / watch time over a configurable window.
- **Recipient management** — add/remove subscribers from the UI, toggle them active without deleting.
- **Schedule** — cron-based, with a few common presets (Sun 9am, Fri 9am, monthly, etc).
- **Test send + preview** — render the newsletter in the browser before sending, or fire a one-off test to your own address.
- **Self-contained** — everything stored in a single SQLite file at `/data/ribs.db`. Mount the `./data` volume to persist.

## Quick start (no clone required)

The image is published to Docker Hub at [`dockerjustin98/pivo`](https://hub.docker.com/r/dockerjustin98/pivo), built for both `linux/amd64` and `linux/arm64` (so it runs on Synology, Raspberry Pi, M-series Macs, and standard Linux servers).

```bash
mkdir pivo && cd pivo
curl -O https://raw.githubusercontent.com/JustinRibs/pivo/main/docker-compose.yml
docker compose up -d
```

Open <http://localhost:1998> in your browser.

### Auth (optional)

By default the UI has no authentication — fine for a trusted home network or when you're putting the app behind something else (Cloudflare Access, Tailscale, Authelia, an Nginx auth_request, etc.).

If you want built-in HTTP basic auth (username `admin`), set `ADMIN_PASSWORD`:

```bash
ADMIN_PASSWORD=your-password docker compose up -d
```

…or write it into a `.env` file next to the compose file:

```env
TZ=America/New_York
ADMIN_PASSWORD=your-password
```

The `/unsubscribe` route stays public regardless so recipients can always opt out.

Updating later:

```bash
docker compose pull && docker compose up -d
```

## Build from source

```bash
git clone https://github.com/JustinRibs/pivo.git
cd pivo
cp .env.example .env
# edit docker-compose.yml: comment out `image:` and uncomment `build: .`
docker compose up -d --build
```

## First-time setup

1. **Branding** — set a name, accent color, optional logo, and any custom header/footer HTML.
2. **Tautulli** — paste your Tautulli URL (e.g. `http://192.168.1.x:8181`) and API key, then hit **Test connection**.
3. **Email (SMTP)** — fill in your Brevo credentials (host `smtp-relay.brevo.com`, port `587`, your SMTP login + key). Hit **Test SMTP**.
4. **Content** — choose what to include: movies, TV, music, summaries, optional stats sections.
5. **Schedule** — set a cron and toggle scheduled sending on. Times are interpreted in the container's `TZ` (default `America/New_York`).
6. **Recipients** — add the people who should get it.
7. **Preview** — see how it'll look. **Send test to me** fires one to whatever address you type.

## Deliverability tips

For a personal-scale newsletter, Brevo will outperform self-hosted SMTP because of the IP-reputation work they handle for you. To stay out of spam folders:

- Set up **SPF**, **DKIM**, and **DMARC** DNS records on your sending domain in Brevo.
- Use a real `From` address on a domain you control (not `@gmail.com`).
- Keep your recipient list small and engaged — Brevo's free/starter tiers have generous limits for personal use.

## Local development

```bash
npm install
DATA_DIR=./data npm run dev
```

The dev server hot-reloads `src/`. The static UI under `public/` is served as-is.

## Data layout

```
data/
├── ribs.db         # sqlite (settings, recipients, send log)
└── uploads/        # logo files
```

Back up the entire `data/` directory and you've backed up your full configuration.

## Troubleshooting

### `EACCES: permission denied, mkdir '/data/uploads'`

The container can't write to the bind-mounted `./data` directory because the in-container user doesn't have write permission on the host folder. This affects older images that ran as the `node` user (uid 1000). Two fixes:

**Easiest — pull the latest image** (current images run as root and don't hit this):

```bash
docker compose pull && docker compose up -d
```

**If you can't pull a new image** (e.g. running an old build), grant the host folder to uid 1000:

```bash
sudo chown -R 1000:1000 ./data
docker compose up -d
```

### Schedule never fires

- Confirm the container is up: `docker compose ps`
- Check `TZ` matches what you expect — cron is interpreted in the container's timezone (`docker compose exec pivo date`)
- Watch the live logs while you wait for the next fire: `docker compose logs -f pivo`

The scheduler intentionally does **not** run a "missed" send if the container was down at the scheduled time — it just waits for the next one.

### Emails land in spam

Almost always a DNS issue, not a code issue:

- In Brevo's dashboard → Senders & IP → Domains, verify SPF / DKIM / DMARC are all green for your sending domain.
- Use a real From address on a domain you control (not `@gmail.com` or other free providers — they'll fail DMARC alignment).
- Send a test to <https://www.mail-tester.com/> and act on whatever it flags.

### Posters missing in the email

Posters are fetched from Tautulli's image proxy and embedded as inline attachments — the container needs to be able to reach Tautulli on the network. If you've changed Tautulli's URL/port and the test connection in the UI passes but emails arrive without posters, restart the newsletter container so it picks up the new config: `docker compose restart`.

## API

Everything the UI does is exposed via REST under `/api`:

| Route | Method | Purpose |
|---|---|---|
| `/api/settings` | GET / PUT | Read or update settings |
| `/api/recipients` | GET / POST | List or add recipients |
| `/api/recipients/:id` | PUT / DELETE | Update or remove a recipient |
| `/api/upload/logo` | POST / DELETE | Upload or remove the logo |
| `/api/test/tautulli` | POST | Verify Tautulli connection |
| `/api/test/smtp` | POST | Verify SMTP connection |
| `/api/test/send` | POST `{email}` | Send one preview to a single address |
| `/api/preview` | GET | Returns rendered HTML (CIDs converted to data URIs) |
| `/api/send-now` | POST | Fire the newsletter to all active recipients now |
| `/api/schedule` | GET | Current cron status + next run |
| `/api/sendlog` | GET | Recent send history |

## Want to support me? Here's my Venmo

If this project saved you some time, a tip is always appreciated — totally optional, no hard feelings either way.

**Venmo:** [@justin-ribarich](https://venmo.com/justin-ribarich)

<img src="venmo-qr.png" alt="Venmo QR code for @justin-ribarich" width="240">

