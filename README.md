# Smart Notes

Smart Notes is an AI-assisted study application that turns questions, conversations, and supported document uploads into concise, structured learning notes. The project combines a React/Vite interface with an Express API, MongoDB persistence, and Gemini generation.

## Problem and solution

Study material often arrives as unstructured conversations, questions, PDFs, or images. Smart Notes gives users one place to ask questions, review concise explanations, and keep selected notes and authenticated chat history organized.

## Features

- Chat-based educational answers with conversation context and concise Markdown formatting.
- English, Urdu, and Roman Urdu responses, following the language used in the conversation.
- Guest chats held temporarily in browser memory; guest conversations are not automatically saved.
- Password signup/sign-in and Google Identity Services sign-in, with backend ID-token verification.
- Explicit Google account linking from an authenticated session; matching email alone does not automatically link accounts.
- Authenticated chat history and saved study notes, scoped to the signed-in user.
- Notes search, copy, Markdown rendering, PDF export, and delete.
- PDF and JPEG/PNG/WebP uploads. PDF text is extracted and summarized in chunks; image content is sent for Gemini analysis. Upload contexts are temporary and are not a permanent file store.
- Forgot-password/reset flow with rate limiting, hashed single-use reset tokens, and SMTP delivery when configured.
- Light/dark themes and responsive sidebar behavior.

## Technology

- Frontend: React, Vite, Tailwind CSS, `react-markdown`, `remark-gfm`, `jspdf`, and `html2canvas`.
- Backend: Node.js, Express, Mongoose, bcrypt, JWT, Google Auth Library, Nodemailer, and `pdfjs-dist`.
- Database: MongoDB, including MongoDB Atlas for hosted deployments.
- AI: Gemini through the backend-only `@google/genai` SDK.

## Architecture

```text
.
├── backend/
│   ├── config/          MongoDB connection
│   ├── Middleware/      JWT authentication
│   ├── Models/          User, Chat, and Note schemas
│   ├── routes/          Auth, chat, and notes APIs
│   ├── services/        Gemini, document context, Google identity, reset email
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .env.example
├── package.json         npm workspace scripts
├── package-lock.json    shared workspace lockfile
└── README.md
```

The application uses npm workspaces so frontend and backend dependencies remain declared in their respective manifests while installation is managed through one root lockfile.

## Screenshots

Screenshots have not been added yet.

- Chat: _Screenshot placeholder_
- Notes workspace: _Screenshot placeholder_
- Mobile layout: _Screenshot placeholder_

## Local setup on Windows

### Requirements

- Node.js 22.12 or newer (Vite 7 and the current PDF parser require a recent Node runtime).
- npm.
- MongoDB running locally or an Atlas connection string.
- A Gemini API key for AI features.

### Install and configure

From PowerShell in the project root:

```powershell
Copy-Item .env.example .env
npm install
```

Edit `.env` locally:

1. Set `MONGODB_URL` to a local MongoDB URI or an Atlas URI. Keep the existing `ai-notes-app` database name if you want to preserve the current database.
2. Set `JWT_SECRET` to a long, random secret.
3. Set `GEMINI_API_KEY` on the backend only.
4. Set `GOOGLE_CLIENT_ID` if Google sign-in/linking is enabled.
5. For local development, leave `VITE_API_BASE_URL` empty and use `FRONTEND_URL=http://localhost:5173`.
6. Configure SMTP settings and `APP_BASE_URL` if password-reset email delivery is needed.

The root `.env` is loaded by `backend/server.js` for local use and is excluded from Git. Never add real credentials to `.env.example`, frontend source, or a commit.

### Run the applications

```powershell
# Frontend only
npm run dev

# Backend only, with Node watch mode
npm run dev:backend

# Frontend and backend together
npm run dev:full

# Production frontend build
npm run build

# Backend tests
npm test

# Start the backend normally
npm start
```

The Vite development server proxies API requests to `http://127.0.0.1:3000`. Set `BACKEND_URL` in `.env` or the shell environment to override the local proxy target. The backend listens on `PORT` when provided and otherwise uses port `3000`.

## MongoDB Atlas and Gemini

### MongoDB Atlas

Create a MongoDB Atlas cluster and database user, add the deployment platform’s outbound access as permitted by your Atlas network access policy, and copy the Atlas connection string into `MONGODB_URL`. Replace only the username, password, and cluster host placeholders. URL-encode special characters in the database password. Keep the database name in the URI consistent with the existing deployment; changing it may point the app at a different database.

### Gemini

Create a Gemini API key through Google AI Studio and configure it as `GEMINI_API_KEY` in the backend service environment. The frontend calls the application API; the Gemini key is never bundled into frontend assets.

## Deployment on Render

The recommended layout is a Render **Static Site** for the Vite frontend and a Render **Web Service** for the Express backend. These settings configure deployment but do not deploy the project automatically.

### 1. Backend Web Service

Create a Web Service from the repository:

| Setting | Value |
|---|---|
| Root Directory | Leave blank (repository root; npm workspaces share the root lockfile) |
| Runtime | Node |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start --workspace=backend` |
| Instance type | Free, if available for the account/region |
| Health check path | `/` |

Set these environment variables in Render (values are entered privately in Render; do not put them in Git):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URL` | MongoDB Atlas URI, retaining database name `ai-notes-app` if that is the intended existing database |
| `JWT_SECRET` | A newly generated long random secret |
| `GEMINI_API_KEY` | Gemini API key |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID, if Google sign-in is enabled |
| `FRONTEND_URL` | Exact deployed frontend origin, e.g. `https://your-frontend.onrender.com` |
| `MAX_PDF_SIZE_MB` | Optional; defaults to `10` |
| `MAX_IMAGE_SIZE_MB` | Optional; defaults to `5` |
| `APP_BASE_URL` | Deployed frontend origin, used in password-reset links |
| `SMTP_HOST` | SMTP host (required for email delivery) |
| `SMTP_PORT` | SMTP port (commonly `587` for STARTTLS or `465` for implicit TLS) |
| `SMTP_SECURE` | `false` for port 587; `true` for port 465 |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password or provider-issued SMTP credential |
| `EMAIL_FROM` | Sender address approved by your email provider |

Render supplies `PORT`; the backend reads it automatically. The password-reset endpoints return the same generic response when the email provider is not configured, but do not deliver a message until valid SMTP settings are entered.

### 2. Frontend Static Site

Create a Static Site from the same repository:

| Setting | Value |
|---|---|
| Root Directory | Leave blank (repository root) |
| Build Command | `npm ci && npm run build --workspace=frontend` |
| Publish Directory | `frontend/dist` |

Set this build environment variable:

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | Exact backend origin, e.g. `https://your-backend.onrender.com` (no trailing slash) |

`VITE_API_BASE_URL` is a public API URL, not a secret. It is embedded in the frontend build. Never set Gemini, MongoDB, JWT, SMTP, or other credentials as `VITE_*` variables.

If the host requires explicit client-side route fallback configuration, rewrite requests to `/index.html`. The reset token is carried in a URL fragment and does not require a backend redirect.

### 3. Google Identity Services

Google sign-in uses Google Identity Services in the browser and sends an ID token to the backend for verification; it does not use an OAuth redirect callback route in this application. In the Google Cloud OAuth web client configuration:

1. Add the deployed frontend origin (for example `https://your-frontend.onrender.com`) to **Authorized JavaScript origins**.
2. Add local origins such as `http://localhost:5173` only if local sign-in is needed.
3. Configure the same client ID as `GOOGLE_CLIENT_ID` in the backend environment.
4. No **Authorized redirect URI** is used by the current sign-in flow.

### 4. CORS and deployment order

The backend permits requests without an `Origin` header, the configured `FRONTEND_URL` origin(s), and localhost origins only outside production. Set `FRONTEND_URL` to the exact browser-visible frontend origin (comma-separated origins are supported). Deploy the backend, then configure `VITE_API_BASE_URL` with the backend origin and build the frontend. `APP_BASE_URL` should match the deployed frontend origin so reset links open the correct site.

Free-tier service availability, sleeping, build limits, and Atlas free cluster availability depend on provider policies and may change. A sleeping backend can make the first request slow; in-memory guest upload contexts and rate limits are temporary and reset when the service restarts.

## Security notes

- Keep `.env` local and use the host's secret environment-variable interface in production.
- Keep MongoDB credentials, JWT secret, Gemini key, and SMTP credentials on the backend.
- Set `VITE_API_BASE_URL` only to the public backend origin; frontend `VITE_*` values are visible in built assets.
- Google ID tokens are verified server-side. Matching email addresses do not silently link accounts; linking requires an authenticated user and explicit confirmation.
- Password reset tokens are cryptographically random, stored as hashes, short-lived, rate-limited, and single-use.
- Authenticated chats and notes are scoped to the current user. Guest chats are temporary and are not automatically imported.
- Uploaded PDFs and images are processed in temporary server memory; they are not saved as permanent upload files.
- The root `.gitignore` excludes `.env`, dependency folders, build output, and backup/archive patterns. Check staged files before pushing any code.

## Known limitations

- SMTP delivery requires a configured, verified provider and has not been validated for your deployment account.
- Google sign-in requires a valid Google client ID and the production frontend origin registered in Google Cloud.
- Scanned/image-only PDFs may require OCR; text extraction can report that readable text is unavailable.
- Guest conversations and temporary document context are not durable and can be lost on page reload or backend restart.
- The application does not include a permanent uploaded-file storage feature.
- Free hosting tiers may sleep or impose resource limits; they are not a guarantee of uninterrupted production availability.

## Future improvements

- Add deployment smoke tests for the configured production origins and providers.
- Add optional OCR for scanned PDFs with clear privacy and retention controls.
- Add monitoring and operational alerts without logging user documents or secrets.
- Add user-controlled export/import and backup workflows for saved data.

## Author

- Name: _Your Name_
- GitHub: _Your GitHub profile URL_
- LinkedIn: _Your LinkedIn profile URL_
- Live demo: _Add a URL after deployment_
