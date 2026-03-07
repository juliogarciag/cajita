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

7. Add your production URL as an **Authorized redirect URI** in Google Cloud Console:
   `https://your-app.up.railway.app/api/auth/callback`

8. Deploy. Railway will build and start your app automatically.
