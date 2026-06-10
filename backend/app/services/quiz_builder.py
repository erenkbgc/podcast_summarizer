from typing import List, Dict, Any, Optional
import random
import re


BLOOM_LEVELS = ["remember", "understand", "apply", "analyze"]
QUESTION_TYPES = [
    "factual_recall",
    "speaker_attribution",
    "concept_application",
    "causal_reasoning",
    "compare_contrast",
]


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _pick_keyword(text: str) -> Optional[str]:
    tokens = re.findall(r"\b[a-zA-ZçğıöşüÇĞİÖŞÜ]{5,}\b", text)
    if not tokens:
        return None
    tokens_sorted = sorted(tokens, key=lambda t: (t.istitle(), len(t)), reverse=True)
    return tokens_sorted[0]

def _short_quote(text: str, max_words: int = 14) -> str:
    cleaned = _clean_text(re.sub(r"^[A-Z_0-9]+:\s*", "", text or ""))
    words = cleaned.split()
    if len(words) <= max_words:
        return cleaned
    return " ".join(words[:max_words]).strip() + "..."


def _to_claim(text: str, max_words: int = 12) -> str:
    cleaned = _clean_text(re.sub(r"^[A-Z_0-9]+:\s*", "", text or ""))
    if not cleaned:
        return ""
    sentence = re.split(r"[.!?;]\s+", cleaned)[0].strip() or cleaned
    words = sentence.split()
    if len(words) > max_words:
        sentence = " ".join(words[:max_words]).strip()
    sentence = sentence.strip(" ,;:-")
    if not sentence:
        return ""
    return sentence[0].upper() + sentence[1:]

def _to_topic_option(text: str, lang: str = "en") -> str:
    stop_en = {
        "about", "after", "again", "also", "been", "being", "could", "from", "have", "just", "like", "more",
        "only", "really", "should", "some", "than", "that", "their", "there", "these", "they", "this", "very",
        "what", "when", "with", "would", "yeah", "okay", "well", "into", "then", "them", "because", "while",
        "said", "says", "will", "might", "maybe", "going", "want", "make", "made", "take", "took", "get",
        "gets", "got", "come", "came", "look", "looks", "think", "thinks", "know", "knows", "right", "left",
        "need", "needs", "kind", "sort", "actually", "basically", "today", "week", "year", "time", "people",
    }
    stop_tr = {
        "böyle", "çünkü", "daha", "fakat", "gibi", "için", "kadar", "olarak", "sonra", "şimdi", "veya", "yani",
        "zaten", "bunu", "şunu", "ama", "olan", "olanı", "bile", "buna", "göre", "işte",
    }
    stop = stop_tr if (lang or "en").startswith("tr") else stop_en
    tokens = re.findall(r"\b[a-zA-ZçğıöşüÇĞİÖŞÜ]{4,}\b", _clean_text(text).lower())
    keywords: List[str] = []
    for tok in tokens:
        if tok in stop or tok in keywords:
            continue
        keywords.append(tok)
        if len(keywords) == 3:
            break
    if len(keywords) < 2:
        top = _pick_keyword(_clean_text(text)) or "key concept"
        if (lang or "en").startswith("tr"):
            return f"{top} üzerine ana vurgu"
        return f"A key focus on {top}"
    if (lang or "en").startswith("tr"):
        return f"{keywords[0]}, {keywords[1]} ve {keywords[2] if len(keywords) > 2 else keywords[1]} odağı"
    return f"A focus on {keywords[0]}, {keywords[1]}, and {keywords[2] if len(keywords) > 2 else keywords[1]}"


def _normalize_distribution(target: Dict[str, int], count: int) -> Dict[str, int]:
    safe = {k: max(0, int(v)) for k, v in (target or {}).items()}
    total = sum(safe.values())
    if total <= 0:
        return {"easy": max(1, count // 3), "medium": max(1, count // 2), "hard": max(1, count - (count // 3) - (count // 2))}

    out: Dict[str, int] = {}
    keys = list(safe.keys())
    running = 0
    for i, key in enumerate(keys):
        if i == len(keys) - 1:
            out[key] = max(0, count - running)
        else:
            val = int(round((safe[key] / total) * count))
            out[key] = max(0, val)
            running += out[key]
    return out


def _build_difficulty_plan(count: int, difficulty_profile: Optional[Dict[str, int]]) -> List[str]:
    normalized = _normalize_distribution(difficulty_profile or {}, count)
    plan: List[str] = []
    for k, v in normalized.items():
        plan.extend([k] * v)
    if not plan:
        plan = ["medium"] * count
    return plan[:count]


def build_quiz_from_transcript(
    segments: List[Dict[str, Any]],
    speaker_map: Optional[Dict[str, str]] = None,
    count: int = 10,
    lang: str = "en",
    difficulty_profile: Optional[Dict[str, int]] = None,
    cognitive_targets: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Deterministic fallback quiz generation with diversity and Bloom alignment."""
    if not segments:
        return []

    speaker_map = speaker_map or {}
    random.seed(42)

    if not cognitive_targets:
        cognitive_targets = BLOOM_LEVELS

    difficulty_plan = _build_difficulty_plan(count, difficulty_profile)

    candidates = [s for s in segments if isinstance(s.get("text"), str) and len(s["text"]) >= 60]
    if len(candidates) < count:
        candidates = [s for s in segments if isinstance(s.get("text"), str) and len(s["text"]) >= 40]

    seen = set()
    uniq = []
    for s in candidates:
        t = _clean_text(s["text"])
        key = t[:120].lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(s)

    random.shuffle(uniq)
    if not uniq:
        return []

    speakers = list({s.get("speaker", "Unknown") for s in segments})
    speaker_labels = [speaker_map.get(s, s) for s in speakers]
    speaker_labels = [s for s in speaker_labels if s]

    templates = {
        "tr": {
            "recall": [
                "Bu bölümde tartışılan ana nokta neydi?",
                "Aşağıdakilerden hangisi bu bölümün temel mesajını en iyi özetler?",
                "Bu kesitte en çok hangi fikir öne çıkıyor?",
            ],
            "speaker": "Bunu kim söyledi: “{quote}”?",
            "apply": "Aşağıdaki ifadelerden hangisi bu bölümdeki fikrin pratik uygulamasıdır?",
            "analyze": "Bu bölümde anlatılanlar içinde neden-sonuç ilişkisini en iyi yansıtan seçenek hangisi?",
            "compare": "Aşağıdaki seçeneklerden hangisi konuşulan iki yaklaşımı en iyi karşılaştırır?",
            "exp": "Doğru cevap dökümdeki kanıta dayanır.",
        },
        "en": {
            "recall": [
                "What was a major point discussed in this section?",
                "Which option best captures the core idea of this section?",
                "What theme is most central in this segment?",
            ],
            "speaker": "Who said: “{quote}”?",
            "apply": "Which option best applies the idea discussed in this section to a practical scenario?",
            "analyze": "Which option best reflects a cause-and-effect relationship from this segment?",
            "compare": "Which option best compares two perspectives discussed in the segment?",
            "exp": "The correct answer is grounded in transcript evidence.",
        },
    }
    t = templates.get(lang[:2], templates["en"])

    quiz_items: List[Dict[str, Any]] = []
    used_questions = set()

    def meta(idx: int, q_type: str) -> Dict[str, str]:
        return {
            "difficulty": difficulty_plan[idx % len(difficulty_plan)],
            "cognitive_level": cognitive_targets[idx % len(cognitive_targets)],
            "question_type": q_type,
        }

    # 1) factual_recall
    factual_limit = max(2, count // 3)
    for s in uniq:
        if len(quiz_items) >= count:
            break
        if len([q for q in quiz_items if q.get("question_type") == "factual_recall"]) >= factual_limit:
            break
        correct = _to_topic_option(s["text"], lang=lang)
        if len(correct.split()) < 4:
            continue
        distractors = [_to_topic_option(c["text"], lang=lang) for c in uniq if c is not s][:30]
        random.shuffle(distractors)
        options = [correct] + distractors[:3]
        options = list(dict.fromkeys([o for o in options if o]))[:4]
        if len(options) < 4:
            continue
        recall_templates = t["recall"] if isinstance(t["recall"], list) else [t["recall"]]
        q_text = recall_templates[len(quiz_items) % len(recall_templates)]
        if q_text in used_questions:
            q_text = f"{q_text} ({len(quiz_items)+1})"
        used_questions.add(q_text)
        idx = len(quiz_items)
        quiz_items.append(
            {
                "question": q_text,
                "options": options,
                "correct_answer": correct,
                "explanation": t["exp"],
                "source_start": s.get("start"),
                "source_end": s.get("end"),
                "source_text": _clean_text(s["text"]),
                **meta(idx, "factual_recall"),
            }
        )

    # 2) speaker attribution
    if speaker_labels and len(speaker_labels) >= 2:
        for s in uniq:
            if len(quiz_items) >= count:
                break
            spk = speaker_map.get(s.get("speaker", "Unknown"), s.get("speaker", "Unknown"))
            if not spk:
                continue
            options = [spk] + [x for x in speaker_labels if x != spk][:3]
            options = list(dict.fromkeys(options))[:4]
            if len(options) < 2:
                continue
            quote = _short_quote(s["text"])
            q_text = t["speaker"].format(quote=quote)
            if q_text in used_questions:
                continue
            used_questions.add(q_text)
            idx = len(quiz_items)
            quiz_items.append(
                {
                    "question": q_text,
                    "options": options,
                    "correct_answer": spk,
                    "explanation": t["exp"],
                    "source_start": s.get("start"),
                    "source_end": s.get("end"),
                    "source_text": quote,
                    **meta(idx, "speaker_attribution"),
                }
            )

    # 3) concept application
    for s in uniq:
        if len(quiz_items) >= count:
            break
        text = _clean_text(s["text"])
        keyword = _pick_keyword(text)
        if not keyword:
            continue
        distractors = []
        for c in uniq:
            if c is s:
                continue
            k = _pick_keyword(_clean_text(c["text"]))
            if k and k.lower() != keyword.lower():
                distractors.append(k)
        random.shuffle(distractors)
        options = [keyword] + distractors[:3]
        options = list(dict.fromkeys(options))[:4]
        if len(options) < 3:
            continue

        q_type = QUESTION_TYPES[len(quiz_items) % len(QUESTION_TYPES)]
        q_text = {
            "concept_application": t["apply"],
            "causal_reasoning": t["analyze"],
            "compare_contrast": t["compare"],
        }.get(q_type, t["apply"])

        if q_text in used_questions:
            q_text = f"{q_text} ({len(quiz_items)+1})"
        used_questions.add(q_text)
        idx = len(quiz_items)
        quiz_items.append(
            {
                "question": q_text,
                "options": options,
                "correct_answer": keyword,
                "explanation": t["exp"],
                "source_start": s.get("start"),
                "source_end": s.get("end"),
                "source_text": text,
                **meta(idx, q_type),
            }
        )

    # Ensure target count with safe truncation.
    return quiz_items[:count]
