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

## Verification

```powershell
npm run audit:types
npm run build
npm audit
```
