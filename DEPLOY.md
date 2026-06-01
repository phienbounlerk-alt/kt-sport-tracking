# KT SPORT Tracking Deploy

Localhost links work only on this computer. To let customers open tracking links from anywhere, deploy this project to a public server/domain and set `PUBLIC_BASE_URL`.

## What Makes Links Public

All current and future customer links use the same pattern:

```text
https://your-domain.com/?code=ORDER_CODE
```

When the admin creates a new order, the copied link will use `PUBLIC_BASE_URL`.

Example:

```bash
PUBLIC_BASE_URL="https://your-domain.com" ADMIN_PASSWORD="your-password" PORT=4173 node server.js
```

After that, copied customer links will use:

```text
https://your-domain.com/?code=ORDER_CODE
```

Notes:

- Keep the server running on a VPS/cloud host if customers must view links even when your computer is off.
- The customer tracking endpoint is public: `/api/orders/:code`.
- Admin APIs, upload, create, and update require login.

## Persistent Data

Set `DATA_DIR` on the server so orders and uploaded images are stored outside the app folder:

```bash
DATA_DIR="/var/data/kt-sport" PUBLIC_BASE_URL="https://your-domain.com" ADMIN_PASSWORD="your-password" node server.js
```

The server stores:

- orders: `$DATA_DIR/orders.json`
- uploaded images: `$DATA_DIR/uploads`

## Render Blueprint

This repo includes `render.yaml`. On Render:

1. Create a new Blueprint from the repository.
2. Set `ADMIN_PASSWORD`.
3. Set `PUBLIC_BASE_URL` to your Render/custom domain, for example `https://kt-sport.onrender.com`.
4. Deploy.

The included disk keeps orders and uploads after deploy/restart.

## Google Sheets Sync

The server syncs orders, settings, and catalog data to Google Sheets when these environment variables are set:

```bash
GOOGLE_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
GOOGLE_SHEETS_WEBHOOK_SECRET="change-this-secret"
```

Local setup:

1. Copy `.env.example` to `.env`.
2. Paste your Apps Script Web App URL into `GOOGLE_SHEETS_WEBHOOK_URL`.
3. Keep `GOOGLE_SHEETS_WEBHOOK_SECRET` the same as `WEBHOOK_SECRET` in `google-sheets-webhook.gs`.
4. Restart the server.
5. Open `/api/health`; `googleSheetsSync` should be `true`.

Google Sheets setup:

1. Open a Google Sheet.
2. Go to Extensions > Apps Script.
3. Paste the contents of `google-sheets-webhook.gs`.
4. Change `WEBHOOK_SECRET` if needed.
5. Deploy > New deployment > Web app.
6. Set "Execute as" to yourself and "Who has access" to anyone with the link.
7. Copy the Web App URL into the server environment.
