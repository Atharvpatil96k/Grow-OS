# GrowOS — AI Growth Operating System

> AI-powered marketing platform for Indian SMBs. Generate complete growth plans, content calendars, captions, ad strategies, and festival campaigns — then publish manually when you're ready.

## Architecture

```
growos/
├── backend/
│   ├── server.js              ← Express entry point
│   ├── config/env.js          ← Environment validation
│   ├── routes/                ← API route definitions
│   ├── controllers/           ← Request handlers
│   ├── services/              ← Business logic (Gemini, social, plan)
│   ├── middleware/            ← Error handler, request logger
│   ├── validators/            ← AJV schema validation
│   ├── helpers/               ← Festival calendar
│   ├── utils/                 ← Logger, session store, response helpers
│   └── tests/                 ← Jest test suite
├── frontend/
│   ├── index.html             ← SPA dashboard
│   ├── css/main.css           ← Dark glassmorphism theme
│   └── js/app.js              ← Client-side logic
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── jest.config.js
```

## Quick Start (Development)

```bash
# 1. Clone and install
git clone <repo-url> && cd growos
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — add your GEMINI_API_KEY (required)

# 3. Start dev server
npm run dev
# → http://localhost:3001
```

## Docker Deployment

```bash
# 1. Configure
cp .env.example .env
# Edit .env with your keys

# 2. Build and run
docker-compose up --build -d

# App: http://localhost:3001
# Redis: localhost:6379
```

## Deploy to Cloud

### Railway
1. Connect your GitHub repo
2. Set environment variables in Railway dashboard
3. Railway auto-detects Dockerfile — deploys automatically

### Render
1. Create a new Web Service from your repo
2. Set build command: `npm install`
3. Set start command: `npm start`
4. Add environment variables in Render dashboard

### Fly.io
```bash
fly launch
fly secrets set GEMINI_API_KEY=your-key
fly deploy
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `PORT` | ❌ | Server port (default: 3001) |
| `NODE_ENV` | ❌ | `development` or `production` |
| `ALLOWED_ORIGIN` | ❌ | CORS whitelist (comma-separated) |
| `REDIS_URL` | ❌ | Redis connection URL (falls back to in-memory) |
| `UNSPLASH_ACCESS_KEY` | ❌ | Unsplash API key for image search |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | ❌ | Facebook Page token |
| `FACEBOOK_PAGE_ID` | ❌ | Facebook Page ID |
| `INSTAGRAM_ACCOUNT_ID` | ❌ | Instagram Business Account ID |
| `TWITTER_API_KEY` | ❌ | X/Twitter API key |
| `TWITTER_API_SECRET` | ❌ | X/Twitter API secret |
| `TWITTER_ACCESS_TOKEN` | ❌ | X/Twitter access token |
| `TWITTER_ACCESS_SECRET` | ❌ | X/Twitter access secret |

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Conversational onboarding + plan generation |
| POST | `/api/regenerate` | Regenerate a specific plan section |
| POST | `/api/publish` | **Manual-only** social media publishing |
| POST | `/api/unsplash-search` | Search Unsplash for images |
| GET | `/api/social-status` | Check configured social accounts |
| GET | `/api/publish-history/:session_id` | Get publish history |
| POST | `/api/reset` | Clear a session |
| GET | `/health` | Health check |

### Publishing Flow (Manual Only)

> ⚠️ GrowOS **never** auto-posts. Content is published **only** when the user clicks "Publish Now" in the UI.

1. User completes the chat to generate a marketing plan
2. User opens **Post Manager** and selects a caption
3. User selects target platforms
4. User clicks **Publish Now**
5. A **confirmation modal** appears — user must confirm
6. The app calls `POST /api/publish` for each platform
7. Results appear as toast notifications + inline status

## Scripts

| Script | Command |
|--------|---------|
| Dev server | `npm run dev` |
| Production | `npm start` |
| Tests | `npm test` |
| Lint | `npm run lint` |
| Format | `npm run format` |

## Security Features

- **Helmet** — secure HTTP headers
- **CORS whitelist** — only allowed origins
- **Rate limiting** — 100 requests per 15 min per IP
- **AJV validation** — all request bodies validated
- **No hardcoded secrets** — `.env` only
- **Non-root Docker user**
- **Graceful shutdown** on SIGTERM/SIGINT

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Missing required environment variables` | Check `.env` has `GEMINI_API_KEY` |
| `Redis unavailable` warning | Install Redis or ignore — falls back to in-memory |
| CORS errors in browser | Set `ALLOWED_ORIGIN` in `.env` to match your frontend URL |
| Social posting fails | Check platform API credentials in `.env` |
| Port already in use | Change `PORT` in `.env` |
