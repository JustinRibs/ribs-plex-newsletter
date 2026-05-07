# ribs-newsletter

A self-hosted replacement for Tautulli's "Recently Added" newsletter. Pulls recently added media (and optional watch stats) from your Tautulli instance and sends a clean, branded HTML email to your subscribers on whatever schedule you want.

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

The image is published to Docker Hub at [`dockerjustin98/ribs-newsletter`](https://hub.docker.com/r/dockerjustin98/ribs-newsletter), built for both `linux/amd64` and `linux/arm64` (so it runs on Synology, Raspberry Pi, M-series Macs, and standard Linux servers).

```bash
mkdir ribs-newsletter && cd ribs-newsletter
curl -O https://raw.githubusercontent.com/JustinRibs/ribs-newsletter/main/docker-compose.yml
docker compose up -d
```

Open <http://localhost:1998> in your browser.

To protect the UI with HTTP basic auth (username `admin`), set `ADMIN_PASSWORD`:

```bash
ADMIN_PASSWORD=your-password docker compose up -d
```

…or write it into a `.env` file next to the compose file:

```env
TZ=America/New_York
ADMIN_PASSWORD=your-password
```

Updating later:

```bash
docker compose pull && docker compose up -d
```

## Build from source

```bash
git clone https://github.com/JustinRibs/ribs-newsletter.git
cd ribs-newsletter
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
