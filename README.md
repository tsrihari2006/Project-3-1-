# MyAi

## Project Structure

```
MyAi/
├─ backend/
│  ├─ app/
│  │  ├─ __init__.py
│  │  ├─ main.py
│  │  └─ ... other backend modules
│  ├─ requirements.txt
│  ├─ Dockerfile
│  └─ docker-compose.yml
│
├─ frontend/
│  ├─ package.json
│  ├─ src/
│  │  ├─ index.js
│  │  ├─ App.js
│  │  ├─ App.css
│  │  ├─ App.test.js
│  │  ├─ index.css
│  │  ├─ logo.svg
│  │  ├─ reportWebVitals.js
│  │  ├─ setupTests.js
│  │  ├─ Calendar.js
│  │  ├─ Chatbox.js
│  │  ├─ Frontpage.js
│  │  ├─ History.js
│  │  ├─ Login.js
│  │  ├─ Settings.js
│  │  ├─ Signup.js
│  │  ├─ Tasks.js
│  │  └─ components/
│  ├─ public/
│  │  ├─ index.html
│  │  └─ ...
│  └─ styles/
│     ├─ Chatbox.css
│     ├─ Homepage.css
│     └─ Sidebar.css
```

## Local Development

Backend (FastAPI):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 5000
```

Frontend (React):

```bash
cd frontend
cp ENV.sample .env.local # set REACT_APP_API_URL=http://localhost:5000
npm install
npm start
```

## Deployment (Render)

Use the `render.yaml` blueprint:
- Backend (Docker) from `backend/`, port 5000
- Frontend (Static) from `frontend/`, build with `npm install && npm run build`

Backend env vars to set:
- `GEMINI_API_KEYS` (required)
- `NEO4J_PASSWORD` (required)
- `JWT_SECRET_KEY` (required)
- `COHERE_API_KEY` (optional)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `CORS_ALLOW_ORIGINS` → your frontend URL

Frontend env vars:
- `REACT_APP_API_URL` → your backend URL

## Notes

- Frontend calls backend using `REACT_APP_API_URL` (see `src/config.js`).
- Backend CORS is configurable using `CORS_ALLOW_ORIGINS` in `.env`.
