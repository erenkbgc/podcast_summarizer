from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/podcast_summarizer"
    REDIS_URL: str = "redis://localhost:6379/0"
    OLLAMA_URL: str = "http://localhost:11434"
    QDRANT_URL: str = "http://localhost:6333"
    DEBUG: bool = True
    LLM_PROVIDER: str = "ollama"  # ollama|openai|anthropic
    OLLAMA_MODEL: str = "llama3"
    OPENAI_MODEL: str = "gpt-4o-mini"
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-latest"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    LLM_FALLBACK_CHAIN: str = "ollama:llama3"
    LLM_REQUEST_TIMEOUT_SEC: int = 120
    LLM_MAX_RETRIES: int = 3
    LLM_RETRY_BACKOFF_BASE_SEC: float = 0.8
    LLM_CIRCUIT_BREAKER_FAILURES: int = 5
    LLM_CIRCUIT_BREAKER_COOLDOWN_SEC: int = 60
    LLM_NUM_CTX: int = 16384
    LLM_CTX_WARN_RATIO: float = 0.9
    LLM_AB_TEST_RATIO: int = 50

    # Embeddings / Reranker
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    RERANKER_MODEL_NAME: str = "cross-encoder/ms-marco-MiniLM-L-12-v2"
    
    # Spotify API (Optional but recommended for stability)
    SPOTIFY_CLIENT_ID: str = ""
    SPOTIFY_CLIENT_SECRET: str = ""
    
    # Hugging Face Token (Required for Speaker Diarization)
    HF_TOKEN: str = ""

    # SSRF / download safety
    ALLOW_UNRESTRICTED_DOWNLOADS: bool = False
    ALLOWED_SOURCE_DOMAINS: str = "open.spotify.com,spotify.com,podcasts.apple.com,itunes.apple.com,youtube.com,youtu.be"
    ALLOWED_AUDIO_DOMAINS: str = "audio-ssl.itunes.apple.com,audio.itunes.apple.com,traffic.megaphone.fm,megaphone.fm,traffic.libsyn.com,libsyn.com,chtbl.com,podtrac.com,dts.podtrac.com,cdn.simplecast.com,anchor.fm,cdn.anchor.fm,pscrb.fm,cohst.app,omny.fm,omnycontent.com,art19.com,spreaker.com,blubrry.com,podbean.com,buzzsprout.com,captivate.fm,transistor.fm,p.scdn.co,i.scdn.co,spotifycdn.com,scdn.co,akamaized.net,akamaihd.net,cloudfront.net,googleusercontent.com,fbcdn.net,awseb.me,pdst.fm,chrt.fm,acast.com"
    MAX_DOWNLOAD_MB: int = 500

    # CORS / WS
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,http://localhost:5173,http://127.0.0.1:5173"

    # Fact-checking (Self-hosted or Public SearxNG)
    FACT_CHECK_PROVIDER: str = "searxng" # "searxng" | "none"
    SEARXNG_URL: str = "https://searx.be" # Default public instance or http://localhost:8080

    SECRET_KEY: str = "" # MUST be set in .env
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 # 1 hour (reduced from 7 days)
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days (reduced from 30 days)
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = True

    # API resilience and security
    RATE_LIMIT_DEFAULT: str = "120/minute"
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_INGEST: str = "10/minute"
    RATE_LIMIT_CHAT: str = "30/minute"  # Chat is expensive (RAG + LLM call)
    RATE_LIMIT_STORAGE_URL: str = ""
    CORS_ALLOW_METHODS: str = "GET,POST,PATCH,PUT,DELETE,OPTIONS"
    CORS_ALLOW_HEADERS: str = "Authorization,Content-Type,X-Request-ID"
    CORS_ALLOW_CREDENTIALS: bool = True

    # API caching
    CACHE_DEFAULT_TTL_SEC: int = 120
    CACHE_EPISODE_TTL_SEC: int = 300

    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    DB_POOL_PRE_PING: bool = True
    DB_SLOW_QUERY_MS: int = 250

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_set(cls, v: str) -> str:
        if not v or len(v) < 32:
            raise ValueError(
                "SECRET_KEY must be set to a random string of at least 32 characters. "
                "Set it in your .env file before starting the application."
            )
        return v

settings = Settings()
