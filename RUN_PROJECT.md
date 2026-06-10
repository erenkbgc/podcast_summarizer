# How to Run the Podcast Summarizer

## 🚀 Quick Start (5 minutes)

### Step 1: Navigate to Project
```bash
cd /home/eren/podcast_summarizer
```

### Step 2: Pull Ollama Model
```bash
docker exec psp-ollama ollama pull phi
```
**Time**: 2-3 minutes (600MB download)

### Step 3: Start All Services
```bash
docker compose up -d
```

### Step 4: Verify Everything is Running
```bash
# Check all services
docker ps

# Test API
curl http://localhost:8000/health
```

**Done!** System is running! ✅

---

## 📖 Detailed Steps

### Prerequisites
- Docker installed
- Docker Compose installed
- 4GB RAM free
- Port 8000, 5432, 6333, 11434 available

### Full Startup Process

#### 1. Navigate to Project Directory
```bash
cd /home/eren/podcast_summarizer
```

#### 2. Check Current Status
```bash
# See what's already running
docker ps

# See all containers (running and stopped)
docker ps -a
```

#### 3. Pull the ML Model
```bash
# Download phi model (600MB, 2-3 min)
docker exec psp-ollama ollama pull phi

# Verify it's loaded
docker exec psp-ollama ollama list
```

**Output should show:**
```
NAME                    ID              SIZE      MODIFIED
phi:latest              ....            600MB     2 minutes ago
```

#### 4. Start All Services
```bash
# Start everything in background
docker compose up -d

# OR start with logs visible
docker compose up

# To exit logs, press Ctrl+C (services keep running)
```

#### 5. Wait for Services to Be Ready
```bash
# Monitor startup (takes 30-60 seconds)
docker compose logs -f | grep -E "Application startup complete|healthy|ready"
```

**Services ready when you see:**
- ✅ API: "Application startup complete"
- ✅ PostgreSQL: "healthy"
- ✅ Redis: "healthy"
- ✅ Ollama: model loaded

#### 6. Verify Health
```bash
# API Health
curl http://localhost:8000/health

# Should return: {"status":"healthy"}

# Ollama Health
curl http://localhost:11434/api/tags

# Should return list of models including phi
```

---

## 🎬 Once Running - First Test

### Register a User
```bash
curl -X POST http://localhost:8000/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

**Save the `access_token` from response**

### Test with Real Podcast
```bash
TOKEN="<your_token_here>"

curl -X POST http://localhost:8000/v1/episodes/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://open.spotify.com/episode/3ELtxDu5EpsN5d2wQqBUr9",
    "preferred_lang": "en"
  }'
```

### Run Full Test
```bash
# Automated test script (do this first!)
cd /home/eren/podcast_summarizer
chmod +x QUICK_TEST.sh
./QUICK_TEST.sh
```

---

## 🛑 Stop the Project

### Stop All Services (Keep data)
```bash
docker compose down
```

### Remove Everything (Delete all data)
```bash
# WARNING: This deletes database, Redis cache, and logs
docker compose down -v
```

---

## 🔄 Restart the Project

### Quick Restart
```bash
docker compose restart
```

### Full Restart (Clean)
```bash
# Stop everything
docker compose down

# Start everything fresh
docker compose up -d

# Wait 30 seconds for services to start
sleep 30

# Verify
curl http://localhost:8000/health
```

---

## 📊 Monitor While Running

### Watch Logs
```bash
# All services
docker compose logs -f

# Just API
docker compose logs -f psp-api

# Just workers
docker compose logs -f psp-worker-low

# Just Ollama
docker compose logs -f psp-ollama

# Follow specific pattern
docker logs psp-worker-low -f | grep -E "STATUS|progress|completed"
```

### Check Resource Usage
```bash
docker stats
```

### Database Queries
```bash
# See all episodes
docker exec psp-postgres psql -U postgres -d podcast_summarizer \
  -c "SELECT id, title, status, progress FROM episodes ORDER BY created_at DESC;"

# Check specific episode
docker exec psp-postgres psql -U postgres -d podcast_summarizer \
  -c "SELECT * FROM episodes WHERE id=35;"
```

---

## 🔧 Troubleshooting

### Services Won't Start
```bash
# Check what's running
docker ps -a

# See error logs
docker compose logs

# Try full restart
docker compose down
docker compose up -d
```

### Ollama Model Not Loaded
```bash
# Check if phi is loaded
docker exec psp-ollama ollama list

# Manually pull if missing
docker exec psp-ollama ollama pull phi

# Check Ollama logs
docker logs psp-ollama
```

### Workers Not Processing
```bash
# Check worker logs
docker logs psp-worker-low -f

# Check if task is in queue
docker exec psp-redis redis-cli LLEN celery

# Restart workers
docker compose restart psp-worker-low psp-worker-high
```

### Port Already in Use
```bash
# Find what's using port 8000
lsof -i :8000

# Kill it (if safe)
kill -9 <PID>

# Or change port in docker-compose.yml
# Change: "8000:8000" to "8001:8000"
```

---

## 📱 Access the Project

| Component | URL | Purpose |
|-----------|-----|---------|
| **API** | http://localhost:8000 | REST API root |
| **Swagger Docs** | http://localhost:8000/docs | Interactive API explorer |
| **Ollama** | http://localhost:11434 | LLM model server |
| **PostgreSQL** | localhost:5432 | Database (psql client) |
| **Redis** | localhost:6379 | Cache/queue |
| **Flower** | http://localhost:5555 | Worker monitoring (admin/admin) |

---

## 💾 Environment Variables

**Location**: `/home/eren/podcast_summarizer/.env`

**Key Settings**:
```env
# LLM (Ollama only)
LLM_PROVIDER=ollama
OLLAMA_MODEL=phi

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=podcast_summarizer

# Redis
REDIS_URL=redis://redis:6379/0

# API
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_MINUTES=10080

# Limits
RATE_LIMIT_DEFAULT=120/minute
RATE_LIMIT_AUTH=10/minute
RATE_LIMIT_CHAT=30/minute
```

---

## 🎯 Common Tasks

### Test a New Podcast
```bash
TOKEN="your_token"
PODCAST_URL="spotify_url"

curl -X POST http://localhost:8000/v1/episodes/ingest \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "'$PODCAST_URL'", "preferred_lang": "en"}'
```

### Check Processing Progress
```bash
# Database check
docker exec psp-postgres psql -U postgres -d podcast_summarizer \
  -c "SELECT id, status, progress FROM episodes WHERE id=YOUR_ID;"

# Worker logs
docker logs psp-worker-low -f | grep progress
```

### Clear All Data & Start Fresh
```bash
# Stop services
docker compose down -v

# Remove models
docker exec psp-ollama ollama rm phi

# Start fresh
docker compose up -d
docker exec psp-ollama ollama pull phi
```

---

## ⚡ Pro Tips

1. **Keep logs open**: Run `docker compose logs -f` in one terminal while testing
2. **Use the test script**: `./QUICK_TEST.sh` automates the first test
3. **Monitor resources**: `docker stats` shows CPU/memory usage
4. **Check documentation**: Swagger UI at `/docs` shows all endpoints
5. **Save your token**: Reuse it for multiple API calls

---

## 📞 Need Help?

### Check These Files
- `LOCAL_SETUP_GUIDE.md` - Detailed setup instructions
- `LIVE_TEST_GUIDE.md` - How to test while processing
- `QUICK_TEST.sh` - Automated test script

### Common Commands Reference
```bash
# Start
docker compose up -d

# Stop
docker compose down

# Restart
docker compose restart

# Logs
docker compose logs -f

# Status
docker ps

# Health check
curl http://localhost:8000/health
```

---

## ✅ You're Ready!

Run these commands to get started:

```bash
cd /home/eren/podcast_summarizer
docker exec psp-ollama ollama pull phi
docker compose up -d
sleep 30
curl http://localhost:8000/health
./QUICK_TEST.sh
```

**That's it! The project is running!** 🚀
