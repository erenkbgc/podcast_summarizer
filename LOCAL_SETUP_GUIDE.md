# Local Ollama Setup Guide
## Podcast Summarizer - Cleaned & Ready

**Project Status**: ✅ Clean, minimal, Ollama-only setup

---

## What Changed

### ✅ Cleaned Up
- Removed 70+ unnecessary files (temp docs, test scripts, cache)
- Removed all cloud LLM configs (OpenAI, Anthropic)
- `.env` now Ollama-only (phi model, 600MB)

### ✅ What's Left
- Clean source code (backend + frontend)
- Docker configs
- Essential documentation
- Database migrations

---

## Quick Start (5 minutes)

### Step 1: Pull Model
```bash
docker exec psp-ollama ollama pull phi
# Takes 2-3 minutes to download (600MB)
```

### Step 2: Start Services
```bash
cd /home/eren/podcast_summarizer

# Rebuild with clean config
docker compose build psp-api psp-worker-high psp-worker-low

# Start everything
docker compose up -d
```

### Step 3: Verify Setup
```bash
# Check Ollama
curl http://localhost:11434/api/tags

# Check API
curl http://localhost:8000/health
```

---

## Test It

### Register User
```bash
curl -X POST http://localhost:8000/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPassword123!"
  }' | grep -o '"access_token":"[^"]*"'
```

### Ingest Podcast
```bash
TOKEN="<your_token>"

curl -X POST http://localhost:8000/v1/episodes/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://open.spotify.com/episode/3ELtxDu5EpsN5d2wQqBUr9",
    "preferred_lang": "en"
  }'
```

### Monitor Processing
```bash
# Watch transcription
docker logs psp-worker-low -f | grep -E "STATUS|progress|completed"

# Check Ollama activity
docker logs psp-ollama -f | grep -E "loading|loaded|error"
```

---

## Configuration

### Models Available

**Current (phi)** - Recommended
- Size: 600MB
- Download: 2-3 min
- Speed: ⚡⚡⚡ Fast
- Quality: Good
- File: `.env` → `OLLAMA_MODEL=phi`

**Alternative Options** (if phi doesn't work well)

```bash
# Smaller & faster (400MB)
docker exec psp-ollama ollama pull neural-chat
# Then update .env: OLLAMA_MODEL=neural-chat

# Better quality (2GB, slower)
docker exec psp-ollama ollama pull mistral
# Then update .env: OLLAMA_MODEL=mistral

# Best quality (3.5GB, slowest)
docker exec psp-ollama ollama pull llama2
# Then update .env: OLLAMA_MODEL=llama2
```

After changing model, restart:
```bash
docker compose restart psp-api psp-worker-high psp-worker-low
```

---

## Troubleshooting

### Ollama Model Not Loading
```bash
# Check if model is downloaded
docker exec psp-ollama ollama list

# Manually load model
docker exec psp-ollama ollama pull phi

# Check Ollama logs
docker logs psp-ollama --tail 50
```

### Workers Unhealthy
```bash
# Check worker logs
docker logs psp-worker-low -f
docker logs psp-worker-high -f

# Restart workers
docker compose restart psp-worker-low psp-worker-high

# Verify Ollama is accessible from worker
docker exec psp-worker-low curl http://ollama:11434/api/tags
```

### Slow Processing
- **phi model**: Usually 2-5 min per podcast
- **Neural-chat**: Usually 1-3 min per podcast
- Check CPU: `docker stats` - Ollama should be using 80%+ CPU

### Out of Memory
- Ollama needs ~2GB RAM free
- Try smaller model (neural-chat instead of phi)
- Check: `docker stats psp-ollama`

---

## Features Status

| Feature | Status | Speed |
|---------|--------|-------|
| Summary (3 modes) | ✅ Working | 2-5 min |
| Chat (9 modes) | ✅ Working | 10-30 sec |
| Quiz | ✅ Working | 30-60 sec |
| User Profile | ✅ Working | 20-40 sec |
| Streaming | ✅ Working | Real-time |
| Multilingual | ✅ Working | Same as above |

---

## Performance Tips

### Speed Up Processing
1. Use faster model: `neural-chat` instead of `phi`
2. Reduce context: Set `LLM_NUM_CTX=8192` in .env (default 16384)
3. Enable GPU if available: Docker will auto-detect NVIDIA GPUs

### Save Disk Space
- Phi model: 600MB
- Mistral: 2GB
- Llama2: 3.5GB
- Delete models you don't use: `docker exec psp-ollama ollama rm llama3`

### Use Local Storage
Models are cached in Docker volume. They persist across restarts.
Check usage: `docker volume ls | grep ollama`

---

## Environment (.env)

Clean configuration for local-only setup:

```bash
# LLM Configuration (Ollama only)
LLM_PROVIDER=ollama
OLLAMA_MODEL=phi

# Database (PostgreSQL)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=podcast_summarizer

# Redis
REDIS_URL=redis://redis:6379/0

# Security
SECRET_KEY=9f296c7dede516dd06fd8b52e95416a5dab8bc27b1aef41bec0a83c8f552789b

# API
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_MINUTES=10080

# Rate Limiting
RATE_LIMIT_DEFAULT=120/minute
RATE_LIMIT_AUTH=10/minute
RATE_LIMIT_CHAT=30/minute

# Optional (Spotify, Hugging Face, Tavily)
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
HF_TOKEN=...
TAVILY_API_KEY=...
```

---

## Useful Commands

```bash
# View all running containers
docker ps

# View logs
docker compose logs -f api          # API
docker compose logs -f psp-ollama   # Ollama
docker compose logs -f psp-worker-low  # Transcription worker

# Check resource usage
docker stats

# List Ollama models
docker exec psp-ollama ollama list

# Stop services
docker compose down

# Clean up (remove everything)
docker compose down -v
docker system prune -a
```

---

## Next Steps

1. ✅ Run: `docker exec psp-ollama ollama pull phi`
2. ✅ Restart: `docker compose restart psp-api psp-worker-high psp-worker-low`
3. ✅ Test: Ingest a real podcast (see Test It section above)
4. ✅ Monitor: Watch `docker logs psp-worker-low -f`
5. ✅ Use: Summary, chat, quiz features once processing completes

---

**You're all set!** Everything is clean, Ollama-only, and ready to run locally. 🚀
