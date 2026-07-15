# GroBro School Library Module

A data-driven library management application using React, Express, and libSQL/SQLite
(Turso). Deployable free on Vercel.

## Architecture

- **Frontend:** React + Vite (built to `dist/`, served statically by Vercel).
- **Backend:** Express, running as a Vercel serverless function (`api/index.js`).
- **Database:** [Turso](https://turso.tech) (libSQL — SQLite-compatible, serverless-friendly).
  A **single** database holds all tenants; every library row is scoped by `school_id`.
- **Auth:** stateless JWT (`Authorization: Bearer <token>`), so it works across serverless invocations.

## Local development

1. Install dependencies: `npm install`
2. Copy the env template: `cp .env.example .env`
   The defaults use a **local file database** (`file:local-dev.db`) — no Turso account needed for dev.
3. Start both servers: `npm run dev`
   - API: http://localhost:4000
   - App: the Local URL Vite prints (defaults to http://localhost:5173)

Default logins (change these before real use):
- Super Admin — `admin` / `admin123` (manages schools & accounts)
- Librarian — `librarian` / `grobro123` (Default School library)

## Deploying free on Vercel

### 1. Create a free Turso database
1. Sign up at https://turso.tech and install the CLI (or use the web dashboard).
2. Create a database, then grab its URL and an auth token:
   ```
   turso db create grobro-library
   turso db show grobro-library --url        # -> libsql://grobro-library-<org>.turso.io
   turso db tokens create grobro-library     # -> the auth token
   ```

### 2. Push this repo to GitHub and import it into Vercel
Vercel auto-detects the Vite build. `vercel.json` already configures the static
build and routes `/api/*` to the Express serverless function.

### 3. Set Environment Variables in the Vercel project settings
| Name | Value |
|------|-------|
| `TURSO_DATABASE_URL` | `libsql://grobro-library-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | the token from `turso db tokens create` |
| `JWT_SECRET` | a long random string — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | optional, defaults to `7d` |

### 4. Deploy
On first request the app creates its schema and seeds the Super Admin + Default
School automatically. Log in and **change the default passwords immediately.**

## Bulk CSV Upload

Books and Students pages include a **Bulk Upload** button.
- Download the template from the upload window; keep the column headings unchanged.
- Student upload automatically creates missing grades and grade-specific sections.
- Duplicate Book IDs and Student IDs are rejected (uniqueness is **per school**) and listed in the import summary.

## Notes on the old version

The previous version stored one SQLite `.db` file per school under `server/data/`.
Those files are **no longer used** — data now lives in the single Turso database,
partitioned by `school_id`. If you have real records in an old `server/data/*.db`
file you want to carry over, keep the file and ask for a one-off migration script.
