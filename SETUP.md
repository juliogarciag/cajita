# Cajita Setup

## Prerequisites

- Node.js 20+
- Docker

## Local Development

1. Clone the repo and install dependencies:

```bash
git clone git@github.com:juliogarciag/cajita.git
cd cajita
npm install
```

2. Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

3. Start the Postgres database:

```bash
docker compose up -d
```

4. Run migrations:

```bash
npm run migrate
```

5. Set up Google OAuth (see below), then start the dev server:

```bash
npm run dev
```

The app runs at `http://localhost:3000`.

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Navigate to **APIs & Services > OAuth consent screen**.
4. Select **External** user type. Fill in the app name, user support email, and developer contact email. Save.
5. Navigate to **APIs & Services > Credentials**.
6. Click **Create Credentials > OAuth 2.0 Client ID**.
7. Application type: **Web application**.
8. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback` (for local development)
   - `https://your-production-domain.com/api/auth/callback` (for production)
9. Click **Create**. Copy the **Client ID** and **Client Secret**.
10. Paste them into your `.env` file as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
11. While the OAuth consent screen is in **Testing** mode, go to **OAuth consent screen > Test users** and add the email addresses of your two allowed users. Only test users can authenticate while the app is in testing mode.

## Apple Music Setup (for Create Playlist tool)

1. Go to [Apple Developer](https://developer.apple.com/account/) and sign in.
2. Navigate to **Certificates, Identifiers & Profiles**.
3. Under **Keys**, click the **+** button to create a new key.
4. Enter a name (e.g., "Cajita MusicKit"), check **MusicKit**, and click **Continue** then **Register**.
5. Download the `.p8` key file. Note the **Key ID** shown on the page.
6. Find your **Team ID** in the top-right of the Apple Developer portal (or under **Membership**).
7. Open the `.p8` file in a text editor. Copy the entire contents (including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines).
8. Paste the values into your `.env` file:
   - `APPLE_TEAM_ID` — your Apple Developer Team ID
   - `APPLE_KEY_ID` — the Key ID from step 6
   - `APPLE_MUSIC_PRIVATE_KEY` — the full contents of the `.p8` file

> **Note:** For Railway deployment, paste the `.p8` key contents as a single-line environment variable. Replace newlines with `\n` if needed, or use Railway's multiline variable support.

## Claude AI Setup (for Create Playlist tool)

1. Go to [Anthropic Console](https://console.anthropic.com/).
2. Create an API key.
3. Paste it into your `.env` file as `ANTHROPIC_API_KEY`.

## Allowed Users

Edit `src/config/allowed-users.ts` to set the Google email addresses that are allowed to log in. Only these emails will be granted access.

## Deploy to Railway

1. Push your repo to GitHub.

2. Go to [Railway](https://railway.com/) and create a new project.

3. Add a **PostgreSQL** database to your project (click **New > Database > PostgreSQL**).

4. Add a **service** from your GitHub repo. Railway will auto-detect it as a Node.js app.

5. In the service settings, set:
   - **Build command**: `npm run build`
   - **Start command**: `npm run start` (runs migrations automatically before starting)

6. Railway automatically provides `DATABASE_URL` when the Postgres database is linked to your service. Set the remaining environment variables in the service's **Variables** tab:
   - `GOOGLE_CLIENT_ID` — from Google Cloud Console
   - `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
   - `APP_URL` — your Railway app URL (e.g., `https://cajita-production.up.railway.app`)
   - `NODE_ENV` — `production`
   - `APPLE_TEAM_ID` — from Apple Developer portal
   - `APPLE_KEY_ID` — from Apple Developer portal
   - `APPLE_MUSIC_PRIVATE_KEY` — contents of the `.p8` key file
   - `ANTHROPIC_API_KEY` — from Anthropic Console

7. Add your production URL as an **Authorized redirect URI** in Google Cloud Console:
   `https://your-app.up.railway.app/api/auth/callback`

8. Deploy. Railway will build and start your app automatically.

## ElectricSQL on Railway

The app uses [ElectricSQL](https://electric-sql.com/) for real-time sync. Locally it runs via `docker compose`, but on Railway you need a separate service.

1. In your Railway project, click **New > Docker Image**.

2. Set the image to `electricsql/electric`.

3. In the Electric service's **Variables** tab, add:
   - `DATABASE_URL` — use the **internal** connection string from your Railway Postgres service (e.g., `postgresql://postgres:password@postgres.railway.internal:5432/railway`). You can reference this with Railway's variable referencing: `${{Postgres.DATABASE_URL}}`.
   - `ELECTRIC_INSECURE` — set to `true`. This is safe because the Electric service is only reachable internally via Railway's private network (not exposed publicly).

4. Your Railway Postgres must have `wal_level=logical`. Copy the `DATABASE_PUBLIC_URL` from the Postgres service's **Variables** tab, connect via `psql`, and run:

   ```sql
   ALTER SYSTEM SET wal_level = 'logical';
   ```

   Then restart the Postgres service from the Railway dashboard for the change to take effect.

5. In your **app service's** Variables tab, add:
   - `ELECTRIC_URL` — the **internal** URL of the Electric service (e.g., `http://electric.railway.internal:3000`). You can use Railway's private networking since the app server proxies Electric requests to the client.

6. Redeploy both the Electric service and your app. The app's `/api/electric/:table` proxy endpoint will forward shape requests to Electric internally.
