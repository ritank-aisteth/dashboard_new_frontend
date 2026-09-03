# Deploy the dashboard to Google Cloud Run

This deployment uses two Cloud Run services and two Artifact Registry images:

- `aisteth-dashboard-api` runs the FastAPI backend.
- `aisteth-dashboard` runs the Next.js frontend and forwards API requests to the
  backend while preserving the user's Cognito token.

The commands below are PowerShell commands run from this frontend directory.

## 1. Prepare Google Cloud

Install and authenticate the Google Cloud CLI, then set values for your project.

```powershell
$PROJECT_ID = "your-gcp-project-id"
$REGION = "asia-south1"
$REPOSITORY = "aisteth-dashboard"
$BACKEND_IMAGE = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/backend:latest"
$FRONTEND_IMAGE = "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/frontend:latest"

gcloud config set project $PROJECT_ID
gcloud services enable artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create $REPOSITORY --repository-format=docker --location=$REGION
```

If the repository already exists, the final command can be skipped.

Create a dedicated Cloud Run service account and grant only the Google Cloud
permissions the application needs. Access to AWS Cognito, DynamoDB, and
Elasticsearch is configured separately through the backend environment and
secrets.

```powershell
$RUNTIME_SERVICE_ACCOUNT = "aisteth-dashboard-runtime@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts create aisteth-dashboard-runtime --display-name="AiSteth dashboard runtime"
```

## 2. Build both images

Cloud Build reads each service's Dockerfile and pushes the resulting image to
Artifact Registry.

```powershell
gcloud builds submit . --tag $FRONTEND_IMAGE
gcloud builds submit ..\backend_dashboard --tag $BACKEND_IMAGE
```

## 3. Configure secrets

Do not pass secret values in `--set-env-vars` and do not commit `.env` files.
Create Secret Manager entries for at least the values that are secrets in your
environment. For example:

```powershell
gcloud secrets create cognito-client-secret --replication-policy=automatic
gcloud secrets create es-password --replication-policy=automatic
gcloud secrets create aws-access-key-id --replication-policy=automatic
gcloud secrets create aws-secret-access-key --replication-policy=automatic
```

Add each secret value using the Google Cloud Console or
`gcloud secrets versions add SECRET_NAME --data-file=PATH_TO_VALUE_FILE`. Grant
the runtime service account `roles/secretmanager.secretAccessor` only on those
secrets.

## 4. Deploy the backend

Replace every placeholder with the non-secret settings from
`../backend_dashboard/.env.example`. The temporary wildcard host value is
tightened immediately after Cloud Run assigns the service URL.

```powershell
gcloud run deploy aisteth-dashboard-api `
  --image $BACKEND_IMAGE `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --service-account $RUNTIME_SERVICE_ACCOUNT `
  --port 8080 `
  --set-env-vars "COGNITO_REGION=YOUR_REGION,COGNITO_USER_POOL_ID=YOUR_POOL_ID,COGNITO_APP_CLIENT_ID=YOUR_APP_CLIENT_ID,DASHBOARD_USER_ROLES_TABLE=YOUR_TABLE,DYNAMODB_REGION=YOUR_REGION,AWS_DEFAULT_REGION=YOUR_REGION,THIS_ENV=YOUR_ENV,ES_HOST_DEFAULT=YOUR_ES_URL,ES_USERNAME_DEFAULT=YOUR_ES_USERNAME,DASHBOARD_DATA_MODE=configured,DASHBOARD_AUTHORIZATION_MODE=dynamodb,DASHBOARD_ES_VERIFY_TLS=true,DASHBOARD_ALLOWED_HOSTS=*" `
  --set-secrets "ES_PASSWORD_DEFAULT=es-password:latest,ACCESS_KEY=aws-access-key-id:latest,SECRET_KEY=aws-secret-access-key:latest,AWS_ACCESS_KEY_ID=aws-access-key-id:latest,AWS_SECRET_ACCESS_KEY=aws-secret-access-key:latest"

$BACKEND_URL = gcloud run services describe aisteth-dashboard-api --region $REGION --format="value(status.url)"
$BACKEND_HOST = ([uri]$BACKEND_URL).Host

gcloud run services update aisteth-dashboard-api `
  --region $REGION `
  --update-env-vars "DASHBOARD_ALLOWED_HOSTS=$BACKEND_HOST"
```

`--allow-unauthenticated` allows the frontend service to reach the Cloud Run URL.
The FastAPI application still validates the forwarded Cognito bearer token on
all `/api/v1` routes. If Cloud Run IAM authentication is added later, the
frontend must also generate a Google identity token for backend requests.

## 5. Deploy the frontend

The first deploy creates the stable Cloud Run service URL. The second command
sets that exact URL as the Cognito callback/sign-out origin.

```powershell
gcloud run deploy aisteth-dashboard `
  --image $FRONTEND_IMAGE `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --service-account $RUNTIME_SERVICE_ACCOUNT `
  --port 8080 `
  --set-env-vars "APP_BASE_URL=https://placeholder.invalid,DASHBOARD_API_BASE_URL=$BACKEND_URL,COGNITO_USER_POOL_ID=YOUR_POOL_ID,COGNITO_CLIENT_ID=YOUR_APP_CLIENT_ID,COGNITO_DOMAIN=https://YOUR_DOMAIN.auth.YOUR_REGION.amazoncognito.com" `
  --set-secrets "COGNITO_CLIENT_SECRET=cognito-client-secret:latest"

$FRONTEND_URL = gcloud run services describe aisteth-dashboard --region $REGION --format="value(status.url)"

gcloud run services update aisteth-dashboard `
  --region $REGION `
  --update-env-vars "APP_BASE_URL=$FRONTEND_URL"
```

If the Cognito app client has no secret, omit `COGNITO_CLIENT_SECRET` and the
frontend `--set-secrets` argument.

In the Cognito app client, add:

- callback URL: `$FRONTEND_URL/api/auth/callback`
- sign-out URL: `$FRONTEND_URL/`

If you use a custom domain, set `APP_BASE_URL` and the Cognito URLs to that HTTPS
origin instead. Redeploying an existing image tag creates an immutable Cloud Run
revision resolved to that image digest.

## 6. Verify

```powershell
Invoke-RestMethod "$BACKEND_URL/health"
Start-Process $FRONTEND_URL
```

Check that login, dashboard loading, subscription renewal, and summary export all
work with a non-production test account before directing production traffic.
