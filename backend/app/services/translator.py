import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from typing import List, Dict, Any
import os

class Translator:
    def __init__(self, model_name: str = "facebook/nllb-200-distilled-600M", device: str = None):
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
            
        print(f"Initializing NLLB Translator model: {model_name} on {self.device}")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name).to(self.device)
        
        # Mapping for NLLB language codes
        self.lang_map = {
            "en": "eng_Latn",
            "tr": "tur_Latn",
            "de": "deu_Latn",
            "es": "spa_Latn",
            "fr": "fra_Latn",
            "it": "ita_Latn",
            "pt": "por_Latn",
            "ru": "rus_Cyrl",
            "zh": "zho_Hans",
            "ja": "jpn_Jpan",
            "ko": "kor_Hang"
        }

    def translate_segments(self, segments: List[Dict[str, Any]], target_lang: str, source_lang: str = "en") -> List[Dict[str, Any]]:
        """
        Translates transcript segments using NLLB model.
        """
        if not target_lang or target_lang.lower() == source_lang.lower():
            return segments

        src_code = self.lang_map.get(source_lang.lower(), "eng_Latn")
        tgt_code = self.lang_map.get(target_lang.lower(), "tur_Latn")

        translated = []
        
        # NLLB works better with individual sentences or short paragraphs
        # We can process segments one by one or in small batches
        # For simplicity and to avoid memory issues, we'll do them in small chunks
        
        batch_size = 8
        for i in range(0, len(segments), batch_size):
            batch = segments[i:i + batch_size]
            texts = [s["text"] for s in batch]
            
            # Tokenize
            self.tokenizer.src_lang = src_code
            inputs = self.tokenizer(texts, return_tensors="pt", padding=True, truncation=True).to(self.device)
            
            # Generate
            with torch.no_grad():
                translated_tokens = self.model.generate(
                    **inputs,
                    forced_bos_token_id=self.tokenizer.convert_tokens_to_ids(tgt_code),
                    max_length=256
                )
            
            # Decode
            results = self.tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)
            
            for j, res in enumerate(results):
                seg_copy = batch[j].copy()
                seg_copy["text"] = res
                translated.append(seg_copy)
                
        return translated

# Singleton instance for the service
_translator = None

def get_translator():
    global _translator
    if _translator is None:
        _translator = Translator()
    return _translator
