import whisperx
import torch
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any
import json

# PyTorch 2.6+ compatibility fix for WhisperX/Pyannote models
# Monkeypatch torch.load to force weights_only=False
import torch
original_torch_load = torch.load
def patched_torch_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return original_torch_load(*args, **kwargs)
torch.load = patched_torch_load

# Global cache to prevent reloading massive models into VRAM on every Celery task
_GLOBAL_MODEL_CACHE = {}

class Transcriber:
    def __init__(self, model_size: str = "base", device: str = "cuda", compute_type: str = "float16"):
        """
        Initialize the WhisperX transcriber.
        
        Args:
            model_size: Whisper model size (tiny, base, small, medium, large-v2, large-v3)
            device: "cuda" or "cpu"
            compute_type: "float16" for GPU, "int8" for CPU
        """
        self.model_size = model_size
        self.device = device if torch.cuda.is_available() else "cpu"
        self.compute_type = compute_type if self.device == "cuda" else "int8"
        self.model = None
        
    def load_model(self):
        """Load the Whisper model (lazy loading)"""
        cache_key = f"whisper_{self.model_size}_{self.device}_{self.compute_type}"
        if cache_key not in _GLOBAL_MODEL_CACHE:
            print(f"Loading WhisperX model '{self.model_size}' to VRAM...")
            _GLOBAL_MODEL_CACHE[cache_key] = whisperx.load_model(
                self.model_size, 
                self.device, 
                compute_type=self.compute_type
            )
        self.model = _GLOBAL_MODEL_CACHE[cache_key]
    
    def preprocess_audio(self, audio_path: str) -> str:
        """
        Preprocess audio to mono, 16kHz using ffmpeg.
        Returns path to the preprocessed file.
        """
        input_path = Path(audio_path)
        output_path = input_path.parent / f"{input_path.stem}_preprocessed.wav"
        
        cmd = [
            "ffmpeg", "-i", str(input_path),
            "-ar", "16000",  # 16kHz sample rate
            "-ac", "1",      # Mono
            "-y",            # Overwrite
            str(output_path)
        ]
        
        subprocess.run(cmd, capture_output=True, check=True)
        return str(output_path)
    
    def transcribe(self, audio_path: str, align: bool = True, diarize: bool = False) -> Dict[str, Any]:
        """
        Transcribe audio file using WhisperX.
        
        Args:
            audio_path: Path to audio file
            align: Whether to perform word-level alignment
            diarize: Whether to perform speaker diarization
            
        Returns:
            Dictionary containing transcript data
        """
        self.load_model()
        
        # Preprocess audio
        preprocessed_path = self.preprocess_audio(audio_path)
        
        # Load audio
        audio = whisperx.load_audio(preprocessed_path)
        
        # Transcribe
        result = self.model.transcribe(audio, batch_size=16)
        
        # Alignment (for precise timestamps)
        if align:
            lang = result["language"]
            align_key = f"align_{lang}_{self.device}"
            if align_key not in _GLOBAL_MODEL_CACHE:
                print(f"Loading alignment model for '{lang}' to VRAM...")
                _GLOBAL_MODEL_CACHE[align_key] = whisperx.load_align_model(
                    language_code=lang, 
                    device=self.device
                )
            model_a, metadata = _GLOBAL_MODEL_CACHE[align_key]
            
            result = whisperx.align(
                result["segments"], 
                model_a, 
                metadata, 
                audio, 
                self.device, 
                return_char_alignments=False
            )
        
        # Diarization (speaker identification)
        if diarize:
            from app.core.config import settings
            token = settings.HF_TOKEN
            if token:
                try:
                    print("Performing speaker diarization...")
                    # Newer WhisperX versions have DiarizationPipeline in whisperx.diarize
                    try:
                        from whisperx.diarize import DiarizationPipeline
                    except ImportError:
                        # Fallback for older versions if needed
                        DiarizationPipeline = getattr(whisperx, "DiarizationPipeline", None)
                    
                    if DiarizationPipeline is None:
                        raise ImportError("Could not find DiarizationPipeline in whisperx or whisperx.diarize")
                        
                    # WhisperX/Pyannote API changed across versions; support both auth arg variants.
                    diarize_model = None
                    try:
                        diarize_model = DiarizationPipeline(use_auth_token=token, device=self.device)
                    except TypeError:
                        try:
                            diarize_model = DiarizationPipeline(token=token, device=self.device)
                        except TypeError:
                            diarize_model = DiarizationPipeline(hf_token=token, device=self.device)

                    try:
                        # Most recent pyannote pipelines expect an audio file path/dict input.
                        diarize_segments = diarize_model(preprocessed_path)
                    except Exception:
                        # Fallback for implementations that accept waveform arrays.
                        diarize_segments = diarize_model(audio)
                    # Merge speakers into the aligned segments
                    result = whisperx.assign_word_speakers(diarize_segments, result)
                    print("Diarization complete.")
                except Exception as e:
                    print(f"Diarization failed: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                print("Skipping diarization: No HF_TOKEN provided in settings.")
        
        # Normalize output
        return self._normalize_output(result)
    
    def _normalize_output(self, whisperx_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert WhisperX output to our internal schema.
        """
        segments = []
        full_text = []
        
        for segment in whisperx_result.get("segments", []):
            segments.append({
                "start": segment.get("start", 0.0),
                "end": segment.get("end", 0.0),
                "text": segment.get("text", "").strip(),
                "speaker": segment.get("speaker", "Unknown"),
                "words": segment.get("words", [])
            })
            full_text.append(f"{segment.get('speaker', 'Unknown')}: {segment.get('text', '').strip()}")
        
        return {
            "language": whisperx_result.get("language", "en"),
            "segments": segments,
            "full_text": " ".join(full_text)
        }
