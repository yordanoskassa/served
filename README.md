# Served

Hack-week scaffold for a trustworthy legal-mail triage experience.

## Structure

- `backend/app/main.py` — FastAPI application entrypoint
- `backend/app/routes/` — small HTTP route modules
- `backend/app/schemas/` — request and response contracts
- `backend/app/services/` — business logic and integrations
- `frontend/` — Vite, React, TypeScript, Tailwind, and shadcn-style UI

## Run locally

Backend:

```bash
cd served/backend
../../.venv/bin/python -m uvicorn app.main:app --reload --port 8001
```

Frontend:

```bash
cd served/frontend
export PATH="/opt/homebrew/opt/node/bin:$PATH"
npm install
npm run dev
```

The frontend defaults to `http://localhost:8001/api`. Override it with
`VITE_API_URL` when needed.

## Deploying

For EasyPanel, deploy the root `docker-compose.yml` (or the backend service
using `backend/Dockerfile`). Add the variables from `.env.example` to the
backend service, including `SERVED_CORS_ORIGINS` with the deployed Netlify
origin, for example:

```text
SERVED_CORS_ORIGINS=["https://your-site.netlify.app"]
```

For Netlify, connect the repository and use the included `netlify.toml`.
Set the build environment variable `VITE_API_URL` to the public EasyPanel
backend URL ending in `/api`, such as `https://api.example.com/api`.

## EasyPanel

Deploy the root `docker-compose.yml`, or create two services using
`backend/Dockerfile` and `frontend/Dockerfile`. Set the backend variables from
`.env.example`; shared Lumper credentials should be copied into EasyPanel's
secret environment settings, never committed. Point the frontend's
`BACKEND_URL` at the private backend service URL (or its public HTTPS URL when
the services cannot share a private network).

Google login can reuse Lumper's OAuth client, but the Served production origin
must also be added to that client's Authorized JavaScript origins in Google
Cloud. Served uses the shared Mongo cluster with the separate `served` database.
