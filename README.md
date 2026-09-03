# AiSteth dashboard frontend

The dashboard authenticates through the AWS Cognito Hosted UI using the authorization-code flow with PKCE. Cognito tokens are exchanged by a server callback and stored only in a short-lived `HttpOnly`, `SameSite=Lax` cookie. Tokens are not written to browser storage.

## Local configuration

Copy `.env.example` to `.env.local` and set:

- `APP_BASE_URL` — the exact frontend origin, normally `http://127.0.0.1:3000` locally.
- `COGNITO_USER_POOL_ID` — the Cognito User Pool ID.
- `COGNITO_CLIENT_ID` — the Cognito app client ID.
- `COGNITO_CLIENT_SECRET` — the app client secret when Cognito generated one; otherwise leave it empty.
- `COGNITO_DOMAIN` — the Hosted UI origin, for example `https://dashboard-test.auth.ap-south-1.amazoncognito.com`.
- `DASHBOARD_API_BASE_URL` — the FastAPI origin, normally `http://127.0.0.1:8000` locally.

The Cognito app client must enable the authorization-code grant and the `openid`, `email`, and `profile` scopes. Add `http://127.0.0.1:3000/api/auth/callback` as an allowed callback URL and `http://127.0.0.1:3000/` as an allowed sign-out URL. `.env.local` is ignored by Git.

## Run

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Containers

The frontend and the sibling `backend_dashboard` service each have a production
Dockerfile. To build and run both services locally, make sure `.env.local` exists
here and `.env` exists in `../backend_dashboard`, then run:

```powershell
docker compose up --build
```

The frontend is available at `http://localhost:3000` and the backend health check
at `http://localhost:8000/health`. Environment files are used only at container
runtime and are excluded from both image build contexts.

For Artifact Registry and Cloud Run commands, see [GCP deployment](DEPLOYMENT_GCP.md).

## Verification

```powershell
npm run audit:types
npm run build
npm audit
```
