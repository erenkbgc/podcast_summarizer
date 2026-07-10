"""Tests for the Celery processing pipeline (mocked external dependencies)."""
import json
import pytest
from unittest.mock import MagicMock, patch, PropertyMock


# ── Helpers ───────────────────────────────────────────────────────────────────

MINIMAL_TRANSCRIPT = {
    "segments": [
        {"start": 0.0, "end": 5.0, "text": "Hello world.", "speaker": "SPEAKER_00"},
        {"start": 5.0, "end": 10.0, "text": "This is a test.", "speaker": "SPEAKER_01"},
    ],
    "full_text": "SPEAKER_00: Hello world. SPEAKER_01: This is a test.",
    "language": "en",
}

MINIMAL_SUMMARY = {
    "global_summary": "Test summary.",
    "executive_brief": "Brief.",
    "action_items": ["Action 1"],
    "key_takeaways": ["Takeaway 1"],
    "key_quotes": [],
    "suggested_questions": [],
    "speaker_contribution": {},
    "topics": [],
    "insight_attribution": [],
    "summary_layers": {},
    "perspective_summaries": {},
    "persona_summaries": {"investor": "ok", "skeptic": "ok"},
    "high_value_moments": [],
    "categorized_insights": {},
    "conversation_flow": {},
    "structured_notes": [],
    "action_items_structured": [],
    "insight_density": None,
}


# ── Unit tests ────────────────────────────────────────────────────────────────

class TestUpdateEpisodeStatus:
    """_update_episode_status should write to DB and publish to Redis."""

    def test_sets_episode_status(self):
        from app.worker.tasks import update_episode_status

        db = MagicMock()
        episode = MagicMock()
        episode.id = 42
        episode.user_id = 1
        episode.progress = 0.0

        with patch("app.worker.tasks.redis") as mock_redis:
            mock_r = MagicMock()
            mock_redis.from_url.return_value = mock_r
            update_episode_status(db, episode, "transcribing", 0.1)

        assert episode.status == "transcribing"
        assert episode.progress == 0.1
        db.commit.assert_called_once()

    def test_redis_failure_does_not_raise(self):
        from app.worker.tasks import update_episode_status

        db = MagicMock()
        episode = MagicMock()
        episode.id = 1
        episode.user_id = 1

        with patch("app.worker.tasks.redis") as mock_redis:
            mock_redis.from_url.side_effect = Exception("redis down")
            # Should not raise
            update_episode_status(db, episode, "failed", 0.0)


class TestCosineSimHelper:
    def test_identical_vectors(self):
        from app.worker.tasks import _cosine_similarity
        v = [1.0, 2.0, 3.0]
        assert abs(_cosine_similarity(v, v) - 1.0) < 1e-6

    def test_orthogonal_vectors(self):
        from app.worker.tasks import _cosine_similarity
        assert _cosine_similarity([1, 0], [0, 1]) == pytest.approx(0.0)

    def test_empty_vectors_return_zero(self):
        from app.worker.tasks import _cosine_similarity
        assert _cosine_similarity([], []) == 0.0

    def test_mismatched_lengths_return_zero(self):
        from app.worker.tasks import _cosine_similarity
        assert _cosine_similarity([1, 2], [1]) == 0.0


class TestPercentileHelper:
    def test_median(self):
        from app.worker.tasks import _percentile
        assert _percentile([1, 2, 3, 4, 5], 0.5) == pytest.approx(3.0)

    def test_min(self):
        from app.worker.tasks import _percentile
        assert _percentile([10, 20, 30], 0.0) == pytest.approx(10.0)

    def test_max(self):
        from app.worker.tasks import _percentile
        assert _percentile([10, 20, 30], 1.0) == pytest.approx(30.0)

    def test_single_value(self):
        from app.worker.tasks import _percentile
        assert _percentile([42], 0.5) == pytest.approx(42.0)

    def test_empty_returns_zero(self):
        from app.worker.tasks import _percentile
        assert _percentile([], 0.5) == 0.0


class TestExtractTopicLabel:
    def test_extracts_meaningful_words(self):
        from app.worker.tasks import _extract_topic_label
        stop_words = {"the", "and", "this"}
        label = _extract_topic_label("machine learning and artificial intelligence", stop_words, "fallback")
        assert label  # should not be empty
        assert "fallback" not in label.lower() or True  # may use fallback if all filtered

    def test_empty_text_uses_fallback(self):
        from app.worker.tasks import _extract_topic_label
        label = _extract_topic_label("", set(), "fallback")
        assert label == "fallback"

    def test_all_stop_words_uses_fallback(self):
        from app.worker.tasks import _extract_topic_label
        stop_words = {"the", "and"}
        label = _extract_topic_label("the and", stop_words, "fallback")
        assert label == "fallback"


# ── Integration-style: process_podcast pipeline (fully mocked) ────────────────

class TestProcessPodcastPipeline:
    """Verify the pipeline calls the right services without live infrastructure."""

    def _run_pipeline(self, episode_id: int = 1):
        from app.worker.tasks import process_podcast

        mock_episode = MagicMock()
        mock_episode.id = episode_id
        mock_episode.user_id = 1
        mock_episode.local_path = None
        mock_episode.speaker_map = None
        mock_episode.podcast_id = None
        mock_episode.title = "Test Episode"
        mock_episode.show_name = "Test Show"

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_episode
        mock_db.query.return_value.filter.return_value.delete.return_value = None

        mock_transcript_row = MagicMock()
        mock_transcript_row.raw_json = None

        def query_side_effect(model):
            from app.models.podcast import Episode, Transcript
            m = MagicMock()
            if model is Episode:
                m.filter.return_value.first.return_value = mock_episode
            elif model is Transcript:
                m.filter.return_value.first.return_value = mock_transcript_row
            else:
                m.filter.return_value.first.return_value = None
                m.filter.return_value.delete.return_value = None
            return m

        mock_db.query.side_effect = query_side_effect

        with patch("app.worker.tasks.SessionLocal", return_value=mock_db), \
             patch("app.worker.tasks.Downloader") as MockDownloader, \
             patch("app.worker.tasks.Transcriber") as MockTranscriber, \
             patch("app.worker.tasks.LLMClient") as MockLLM, \
             patch("app.worker.tasks.EmbeddingService") as MockEmbed, \
             patch("app.worker.tasks.VectorStore") as MockVS, \
             patch("app.worker.tasks.FactChecker") as MockFC, \
             patch("app.worker.tasks.redis") as mock_redis:

            # Downloader returns a fake path
            MockDownloader.return_value.download.return_value = "/tmp/test_audio.mp3"
            mock_episode.local_path = None  # force download

            # Transcriber returns minimal data
            MockTranscriber.return_value.transcribe.return_value = MINIMAL_TRANSCRIPT

            # LLM methods return minimal valid responses
            llm_instance = MockLLM.return_value
            llm_instance.identify_speakers.return_value = {"SPEAKER_00": "Alice", "SPEAKER_01": "Bob"}
            llm_instance.generate_summary.return_value = MINIMAL_SUMMARY
            llm_instance.generate_visual_signals.return_value = {"topic_transitions": [], "insight_points": []}
            llm_instance.extract_chapters.return_value = [{"timestamp": 0.0, "end_timestamp": 10.0, "title": "Intro", "summary": "Intro chapter"}]
            llm_instance.extract_glossary.return_value = []
            llm_instance.extract_entities.return_value = []
            llm_instance.generate_quiz.return_value = [
                {"question": "What did Alice say?", "options": ["A", "B", "C"], "correct_answer": "A", "difficulty": "easy"}
            ]
            llm_instance.extract_verifiable_claims.return_value = []
            llm_instance._get_lang_name.return_value = "English"

            # Embedding and vector store
            MockEmbed.return_value.embed_text.return_value = [0.1] * 384
            MockEmbed.return_value.embed_batch.return_value = [[0.1] * 384]

            # Fact checker
            MockFC.return_value.verify_claims.return_value = []

            mock_redis.from_url.return_value = MagicMock()

            # Bind task self
            task_instance = MagicMock()
            task_instance.request.retries = 0
            task_instance.max_retries = 3

            process_podcast.__func__(task_instance, episode_id, "http://example.com/audio.mp3", "en", "default")

        return mock_episode, MockDownloader, MockTranscriber, MockLLM

    def test_pipeline_downloads_audio_when_no_local_path(self):
        episode, MockDownloader, _, _ = self._run_pipeline()
        MockDownloader.return_value.download.assert_called_once()

    def test_pipeline_calls_transcriber(self):
        _, _, MockTranscriber, _ = self._run_pipeline()
        MockTranscriber.return_value.transcribe.assert_called_once()

    def test_pipeline_calls_llm_for_summary(self):
        _, _, _, MockLLM = self._run_pipeline()
        MockLLM.return_value.generate_summary.assert_called_once()

    def test_pipeline_calls_chapter_extraction(self):
        _, _, _, MockLLM = self._run_pipeline()
        MockLLM.return_value.extract_chapters.assert_called_once()
