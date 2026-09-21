# Deployment

## Backend: Render

- Root `render.yaml` is already configured for a Python web service.
- Key env vars:
  - `PUBLIC_BASE_URL` — public hostname used for QR join links.
  - `CORS_ORIGINS` — comma-separated allowed origins for the frontend.
- Default Render service name in config: `echotext-backend`.

## Frontend: Vercel

- Root for frontend deployment: `frontend/`
- Build command: `npm run build`
- Output directory: `dist/`
- `frontend/vercel.json` includes SPA rewrite and basic security headers.

### Required Vercel env var

- `VITE_BACKEND_URL` — set this to the deployed backend URL, for example:
  - `https://echotext-backend.onrender.com`

## Local preview after build

```bash
cd frontend
npm run build
npm run preview
```

## Notes

- Backend CORS is currently wide-open for MVP deployment; tighten `CORS_ORIGINS` after frontend domain is confirmed.
- QR links use `PUBLIC_BASE_URL/join`; update that env var if the public domain changes.
