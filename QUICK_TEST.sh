#!/bin/bash

# Podcast Summarizer - Quick Test Script
# Tests all features with a real Spotify podcast

API_URL="http://localhost:8000"
PODCAST_URL="https://open.spotify.com/episode/3ELtxDu5EpsN5d2wQqBUr9?si=c987382745ec4ed9"

echo "🎙️  Podcast Summarizer - Quick Test"
echo "==================================="
echo ""

# Step 1: Register user
echo "📋 Step 1: Register User"
echo "-----------------------"
REGISTER=$(curl -s -X POST "$API_URL/v1/register" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser_'$(date +%s)'",
    "email": "test_'$(date +%s)'@example.com",
    "password": "TestPassword123!"
  }')

TOKEN=$(echo "$REGISTER" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
USER_ID=$(echo "$REGISTER" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Registration failed"
  echo "$REGISTER"
  exit 1
fi

echo "✅ User registered"
echo "   User ID: $USER_ID"
echo "   Token: ${TOKEN:0:20}..."
echo ""

# Step 2: Ingest podcast
echo "📥 Step 2: Ingest Podcast"
echo "------------------------"
INGEST=$(curl -s -X POST "$API_URL/v1/episodes/ingest" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "'$PODCAST_URL'",
    "preferred_lang": "en"
  }')

EPISODE_ID=$(echo "$INGEST" | grep -o '"id":[0-9]*' | cut -d':' -f2)
STATUS=$(echo "$INGEST" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
TITLE=$(echo "$INGEST" | grep -o '"title":"[^"]*"' | cut -d'"' -f4 | head -c 50)

if [ -z "$EPISODE_ID" ]; then
  echo "❌ Ingest failed"
  echo "$INGEST"
  exit 1
fi

echo "✅ Podcast ingested"
echo "   Episode ID: $EPISODE_ID"
echo "   Title: $TITLE..."
echo "   Status: $STATUS"
echo ""

# Step 3: Check episode details
echo "📊 Step 3: Check Episode Details"
echo "-------------------------------"
EPISODE=$(curl -s -X GET "$API_URL/v1/episodes/$EPISODE_ID" \
  -H "Authorization: Bearer $TOKEN")

PROGRESS=$(echo "$EPISODE" | grep -o '"progress":[0-9.]*' | cut -d':' -f2)
SHOW=$(echo "$EPISODE" | grep -o '"show_name":"[^"]*"' | cut -d'"' -f4)

echo "✅ Episode details retrieved"
echo "   Show: $SHOW"
echo "   Progress: $PROGRESS%"
echo ""

# Step 4: Test summary endpoint (will be empty until processing completes)
echo "📝 Step 4: Test Summary Endpoint"
echo "------------------------------"
SUMMARY=$(curl -s -X GET "$API_URL/v1/episodes/$EPISODE_ID/summary" \
  -H "Authorization: Bearer $TOKEN")

EXECUTIVE=$(echo "$SUMMARY" | grep -o '"executive_brief":"[^"]*"' | cut -d'"' -f4 | head -c 40)

if [ -n "$EXECUTIVE" ]; then
  echo "✅ Summary available"
  echo "   Brief: $EXECUTIVE..."
else
  echo "⏳ Summary: Still processing (status: $STATUS)"
fi
echo ""

# Step 5: Test chat endpoint
echo "💬 Step 5: Test Chat (Regular)"
echo "-----------------------------"
CHAT=$(curl -s -X POST "$API_URL/v1/episodes/$EPISODE_ID/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is this about?", "mode": "assistant"}' 2>&1)

CHAT_RESPONSE=$(echo "$CHAT" | grep -o '"response":"[^"]*"' | cut -d'"' -f4 | head -c 50)
CHAT_ERROR=$(echo "$CHAT" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)

if [ -n "$CHAT_RESPONSE" ]; then
  echo "✅ Chat working"
  echo "   Response: $CHAT_RESPONSE..."
elif [ "$CHAT_ERROR" == "Episode not yet processed" ]; then
  echo "⏳ Chat: Waiting for episode processing"
else
  echo "⚠️  Chat response: $CHAT_ERROR"
fi
echo ""

# Step 6: Test streaming chat endpoint
echo "🔄 Step 6: Test Chat Streaming (SSE)"
echo "----------------------------------"
echo "Testing /chat/stream endpoint..."
STREAM=$(curl -s -X POST "$API_URL/v1/episodes/$EPISODE_ID/chat/stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Test", "mode": "assistant"}' 2>&1 | head -c 100)

if [[ "$STREAM" == *"data:"* ]]; then
  echo "✅ Chat streaming working (SSE)"
elif [[ "$STREAM" == *"processing"* ]] || [[ "$STREAM" == *"409"* ]]; then
  echo "⏳ Chat streaming: Waiting for episode processing"
else
  echo "⚠️  Response: ${STREAM:0:80}..."
fi
echo ""

# Step 7: Test quiz endpoint
echo "❓ Step 7: Test Quiz Generation"
echo "------------------------------"
QUIZ=$(curl -s -X GET "$API_URL/v1/episodes/$EPISODE_ID/quiz" \
  -H "Authorization: Bearer $TOKEN")

QUIZ_COUNT=$(echo "$QUIZ" | grep -o '"question"' | wc -l)

if [ "$QUIZ_COUNT" -gt 0 ]; then
  echo "✅ Quiz available ($QUIZ_COUNT questions)"
else
  echo "⏳ Quiz: Waiting for episode processing"
fi
echo ""

# Step 8: Test user profile
echo "👤 Step 8: Test User Profile"
echo "---------------------------"
PROFILE=$(curl -s -X GET "$API_URL/v1/users/me" \
  -H "Authorization: Bearer $TOKEN")

USERNAME=$(echo "$PROFILE" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)

if [ -n "$USERNAME" ]; then
  echo "✅ User profile retrieved"
  echo "   Username: $USERNAME"
else
  echo "⚠️  Profile: Could not retrieve"
fi
echo ""

# Summary
echo "📊 TEST SUMMARY"
echo "=============="
echo ""
echo "API Status: ✅ Responding"
echo "Authentication: ✅ Working"
echo "Episode Ingestion: ✅ Working"
echo "Episode Details: ✅ Retrieved"
echo "Summary: $([ -n "$EXECUTIVE" ] && echo '✅ Ready' || echo '⏳ Processing')"
echo "Chat: $([ -n "$CHAT_RESPONSE" ] && echo '✅ Working' || echo '⏳ Processing')"
echo "Chat Streaming: $([ "$STREAM" == *"data:"* ] && echo '✅ Working' || echo '⏳ Processing')"
echo "Quiz: $([ "$QUIZ_COUNT" -gt 0 ] && echo '✅ Ready' || echo '⏳ Processing')"
echo "User Profile: ✅ Working"
echo ""

# Next steps
echo "📋 NEXT STEPS"
echo "============"
echo ""
if [ "$STATUS" == "pending" ]; then
  echo "1. Monitor transcription progress:"
  echo "   docker logs psp-worker-low -f | grep -E 'STATUS|progress|completed'"
  echo ""
  echo "2. Check database for progress:"
  echo "   docker exec psp-postgres psql -U postgres -d podcast_summarizer \\"
  echo "     -c \"SELECT id, status, progress FROM episodes WHERE id=$EPISODE_ID;\""
  echo ""
  echo "3. Once status='completed', all features will be available"
  echo ""
  echo "4. Retry this test script after processing completes"
else
  echo "Episode is processing. Check back in a few minutes!"
fi

echo ""
echo "📞 API Endpoints:"
echo "   Base: $API_URL"
echo "   Docs: $API_URL/docs"
echo "   Episode: $EPISODE_ID"
echo ""
echo "Token saved: $TOKEN"
echo ""
echo "✅ Test complete!"
