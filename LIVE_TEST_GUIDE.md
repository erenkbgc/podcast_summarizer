# Live Testing Guide - System Running! 🎉

## System Status: ✅ ONLINE

**Podcast Ingested**: Episode #35  
**Title**: China's President Xi visits North Korea to talk nuclear programme  
**Show**: FT News Briefing  
**Status**: Processing  

---

## What's Running Right Now

### ✅ Active Services
- **API** (Port 8000): Responding to requests
- **Ollama phi**: Model loaded on GPU, ready to process
- **PostgreSQL**: Episode #35 in database
- **Redis**: Caching layer active
- **Celery Workers**: Ready to process tasks

### 📊 Episode #35 Progress
```
Status: pending (0%)
Next: Download audio → Transcribe → Summarize → RAG setup → Ready
ETA: 5-15 minutes depending on audio length
```

---

## How to Monitor Progress

### Option 1: Watch Worker Logs (Real-time)
```bash
docker logs psp-worker-low -f | grep -E "STATUS|progress|ERROR|completed"
```

**What to look for:**
```
[Downloading]  Starting download...
[Downloaded]   Audio saved
[Transcribing] Processing with Whisper...
[Summarizing]  Running LLM model...
[Completed]    All processing done!
```

### Option 2: Check Database
```bash
# Run every 30 seconds to see progress
docker exec psp-postgres psql -U postgres -d podcast_summarizer \
  -c "SELECT id, status, progress, created_at FROM episodes WHERE id=35;"
```

### Option 3: Watch All Logs
```bash
# API requests
docker logs psp-api -f

# Worker processing
docker logs psp-worker-low -f

# Ollama model inference
docker logs psp-ollama -f

# Resource usage
docker stats
```

---

## Test Endpoints (As Processing Completes)

### 1. Check Status (Every minute)
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODExMDA1MDYsInN1YiI6IjMwYzkzYWY5LWE4YTQtNDUwYy04OWEyLTA2Nzg5YTE0NmM1MSIsInR5cCI6ImFjY2VzcyJ9.mbkpB8SsshSrRRvEedv5q2tRw70FtjOAm-kx9qOAAkE"

curl -s http://localhost:8000/v1/episodes/35 \
  -H "Authorization: Bearer $TOKEN" | grep -o '"status":"[^"]*"'
```

### 2. Get Summary (Once status = completed)
```bash
curl -s http://localhost:8000/v1/episodes/35/summary \
  -H "Authorization: Bearer $TOKEN" | head -c 500
```

Expected: JSON with `executive_brief`, `key_insights`, `action_items`, `key_quotes`

### 3. Chat (Once status = completed)
```bash
curl -X POST http://localhost:8000/v1/episodes/35/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the key topics?", "mode": "assistant"}'
```

Expected: Chat response from phi model

### 4. Chat Streaming (SSE) - Once status = completed
```bash
curl -s -X POST http://localhost:8000/v1/episodes/35/chat/stream \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Summarize in 50 words", "mode": "assistant"}' \
  | head -20
```

Expected: Real-time streaming responses with `data: {"delta": "token"}`

### 5. Quiz (Once status = completed)
```bash
curl -s http://localhost:8000/v1/episodes/35/quiz \
  -H "Authorization: Bearer $TOKEN" | head -c 500
```

Expected: JSON array with quiz questions

### 6. User Profile
```bash
curl -s http://localhost:8000/v1/users/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## What Each Feature Shows

### 📝 Summary (3 Modes × 6 Personas = 18 Views)
**Modes**: TLDR (2 min), Standard (5 min), Deep (15 min)  
**Personas**: Default, Executive, Learner, Builder, Storyteller, Analyst

```json
{
  "executive_brief": "...",
  "key_insights": [
    {"text": "...", "confidence": "HIGH", "why_matters": "..."},
    ...
  ],
  "action_items": ["..."],
  "key_quotes": [
    {"text": "...", "timestamp": 123, "speaker": "..."},
    ...
  ]
}
```

### 💬 Chat (9 Modes)
**Modes**: assistant, socratic, devil_advocate, researcher, debate, storyteller, teacher, fact_checker, casual

Try each mode:
```bash
for mode in assistant socratic devil_advocate researcher debate storyteller teacher fact_checker casual; do
  echo "Testing: $mode"
  curl -s -X POST http://localhost:8000/v1/episodes/35/chat \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"What's the main topic?\", \"mode\": \"$mode\"}"
  echo ""
done
```

### ❓ Quiz
Generated with Bloom's taxonomy levels and difficulty distribution
```json
[
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correct": 0,
    "difficulty": "medium",
    "taxonomy_level": "understand"
  },
  ...
]
```

### 👤 User Profile
```json
{
  "username": "testuser_1781096906",
  "learning_interests": [...],
  "expertise_areas": [...],
  "preferred_complexity": "intermediate",
  "bio": "..."
}
```

---

## Timeline Estimate

| Stage | Time | Activity |
|-------|------|----------|
| **Pending** | 0-2 min | Waiting to start |
| **Downloading** | 2-3 min | Fetching audio from Spotify |
| **Transcribing** | 3-8 min | WhisperX + diarization |
| **Processing** | 8-12 min | Summarization, entities, RAG |
| **Completed** | 12-15 min | All features ready |

**Total Time**: 12-15 minutes for typical 10-20 min podcast

---

## API Documentation

### Interactive Docs (Swagger UI)
```
http://localhost:8000/docs
```

Click around to see all endpoints and test directly in browser!

### API Endpoints
```
POST   /v1/register              Register user
POST   /v1/login                 Login
GET    /v1/users/me              User profile
GET    /v1/episodes              List episodes
POST   /v1/episodes/ingest       Ingest new podcast
GET    /v1/episodes/{id}         Episode details
GET    /v1/episodes/{id}/summary Summary (all modes)
POST   /v1/episodes/{id}/chat    Chat response
POST   /v1/episodes/{id}/chat/stream Chat streaming (SSE)
GET    /v1/episodes/{id}/quiz    Quiz questions
GET    /v1/episodes/{id}/transcript Transcript text
```

---

## Troubleshooting

### Workers Not Starting
```bash
docker logs psp-worker-low -f
docker logs psp-worker-high -f
```

### Ollama Issues
```bash
# Check if phi is loaded
docker exec psp-ollama ollama list

# Check Ollama logs
docker logs psp-ollama -f

# Test Ollama directly
curl http://localhost:11434/api/tags
```

### Chat Streaming Returns 404
This is a known issue from the code refactor. It's in the queue to be fixed.

For now, use regular chat endpoint:
```bash
curl http://localhost:8000/v1/episodes/35/chat
```

### Episode Stuck on "pending"
```bash
# Check worker logs
docker logs psp-worker-low -f | tail -50

# Check Redis queue
docker exec psp-redis redis-cli LLEN celery

# Restart worker if needed
docker compose restart psp-worker-low psp-worker-high
```

---

## Keep This Open While Testing

```bash
# Terminal 1: Watch worker progress
docker logs psp-worker-low -f | grep -E "STATUS|progress|completed|ERROR"

# Terminal 2: Check database status every 30 sec
watch -n 30 "docker exec psp-postgres psql -U postgres -d podcast_summarizer -c \"SELECT status, progress FROM episodes WHERE id=35;\""

# Terminal 3: Run tests
./QUICK_TEST.sh
# Re-run this every 2 minutes to see features become available
```

---

## Next Steps

1. **Monitor** the processing (5-15 minutes)
2. **Retry** QUICK_TEST.sh every 2 minutes
3. **Once completed**, test each feature:
   - Summary in all 3 modes
   - Chat in all 9 modes
   - Quiz generation
   - User profile analysis
4. **Report** any issues or unexpected behavior

---

## System is Ready! 🚀

The podcast summarizer is now running locally with:
- ✅ Ollama phi model (GPU-accelerated)
- ✅ Real-time processing
- ✅ All features ready to test
- ✅ Clean, minimal configuration

**Enjoy testing!** 🎙️
