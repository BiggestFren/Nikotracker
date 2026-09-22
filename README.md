# Nikotracker

Discord bot + web panel that posts scheduled **FTGFF** (Firan Technology Group Corp) stock embeds — with period performance and a price chart.

Automatic posts follow U.S. OTC regular trading hours (9:30 a.m.–4:00 p.m. Eastern, or 1:00 p.m. on early-close days). Each trading day has four reports: at the open and at 25%, 50%, and 75% of the session. About 15 minutes after the close, the bot posts a final report with the last reported trade time, followed by a separate signoff naming the next opening. Holidays and daylight saving time are handled automatically. **Send report now** still works after hours and labels the quote accordingly. The schedule is intended for FTGFF and other U.S. OTC shares; changing to another exchange does not change the trading calendar.

Intraday posts are compact: price, today's change, change since the last post, open, day range, and volume. The closing report and manual reports include the selected detailed metrics and, when enabled, a six-month chart. The ticker heading links to Yahoo Finance when that option is enabled.

## Quick start (local)

```bash
copy .env.example .env
# put DISCORD_TOKEN=... in .env
npm install
npm start
```

Open **http://localhost:3847** → invite bot → pick channel → save → **Send report now**.

---

## Deploy on Portainer (Git stack)

Repo is set up so Portainer can build straight from Git.

### 1. Create a stack from Git

In Portainer:

1. **Stacks** → **Add stack**
2. Choose **Repository**
3. Fill in:
   - **Name:** `nikotracker`
   - **Repository URL:** `https://github.com/BiggestFren/Nikotracker`
   - **Compose path:** `docker-compose.yml`
   - **Branch:** `main`
4. Under **Environment variables**, add at least:

| Name | Value |
|------|--------|
| `DISCORD_TOKEN` | your Discord bot token |
| `HOST_PORT` | `3847` (or any free host port) |
| `PANEL_SECRET` | optional password for the web panel |

5. Deploy the stack.

Portainer will clone the repo, build the image from the `Dockerfile`, and start the container with a persistent volume for settings.

### 2. Open the panel

`http://YOUR_SERVER_IP:3847` (or whatever `HOST_PORT` you set)

Use **Invite bot** in the sidebar, pick a channel, and save.

### 3. Redeploy after updates

In the stack → **Pull and redeploy** (enable re-pull / rebuild) so Portainer rebuilds from the latest `main`.

---

## Docker Compose (manual)

```bash
export DISCORD_TOKEN=your_token_here
docker compose up -d --build
```

Data (channel, cadence, last report price) lives in the `nikotracker-data` volume at `/app/data`.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | yes | Bot token |
| `HOST_PORT` | no | Published host port (default `3847`) |
| `PORT` | no | In-container port (default `3847`) |
| `PANEL_SECRET` | no | Protects `/api/*` except `/api/health` |
| `DISCORD_CLIENT_ID` | no | Fallback for invite URL |

## Bot permissions

View Channel · Send Messages · Embed Links · Attach Files
