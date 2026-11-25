# Smart Resume Builder

React + Tailwind frontend, Node/Express backend, MongoDB storage, Gemini resume suggestions, PDF export and print preview.

## Run locally
1. Install Node 18+ and have a MongoDB (local or free Atlas cluster).
2. Create `server/.env` and set `GEMINI_API_KEY`. Set `MONGODB_URI` if you want to enable saving resumes.
3. `npm run install:all`
4. Two terminals: `npm run dev:server` and `npm run dev:client`, then open http://localhost:5173

## Deploy (single service, e.g. Render / Railway)
- Build command: `npm run install:all && npm run build`
- Start command: `npm start`
- Environment variables: MONGODB_URI (optional), GEMINI_API_KEY, GEMINI_MODEL (optional; defaults to `gemini-3.8-flash`)
- AI suggestions are limited to 5 provider requests per minute per server instance by default. Override with `AI_RATE_LIMIT_MAX_REQUESTS` and `AI_RATE_LIMIT_WINDOW_MS` to match your API quota.
The Express server serves the built React app, so there is only one URL to deploy.
- PDF exports are downloaded and also saved in the project-root `generated pdf/` folder.

## Notes
- Gemini API calls need a valid Gemini API key.
- The app runs without MongoDB, but Save is disabled.
