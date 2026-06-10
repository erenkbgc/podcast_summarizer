import requests
import feedparser
import re
from typing import Optional, Tuple
from urllib.parse import urlparse
from app.core.config import settings

class SourceResolver:
    @staticmethod
    def _allowed_domain(url: str) -> bool:
        try:
            host = urlparse(url).hostname or ""
        except Exception:
            return False
        if getattr(settings, "ALLOW_UNRESTRICTED_DOWNLOADS", False):
            return True
        allowed = [d.strip().lower() for d in settings.ALLOWED_SOURCE_DOMAINS.split(",") if d.strip()]
        allowed += [d.strip().lower() for d in settings.ALLOWED_AUDIO_DOMAINS.split(",") if d.strip()]
        host = host.lower()
        return any(host == d or host.endswith(f".{d}") for d in allowed)

    @staticmethod
    def resolve(url: str) -> Tuple[Optional[str], Optional[dict]]:
        """
        Resolves a URL (Spotify, Apple, RSS) to a direct audio URL and metadata.
        """
        if not SourceResolver._allowed_domain(url) and not ("feed" in url or url.endswith(".rss") or url.endswith(".xml")):
            return None, None
        if "spotify.com" in url:
            return SourceResolver._resolve_spotify(url)
        elif "podcasts.apple.com" in url:
            return SourceResolver._resolve_apple(url)
        elif url.endswith(".rss") or url.endswith(".xml") or "feed" in url:
            # RSS domain must be allow-listed too
            if not SourceResolver._allowed_domain(url):
                return None, None
            return SourceResolver._resolve_rss(url)
        else:
            # Assume it's a direct audio link if nothing else matches
            return url, {"title": "Direct Audio", "show": "Unknown", "source_guid": None}

    @staticmethod
    def _resolve_spotify(url: str) -> Tuple[Optional[str], Optional[dict]]:
        print(f"Resolving Spotify: {url}")
        
        # Try using Spotify API if credentials are provided
        if settings.SPOTIFY_CLIENT_ID and settings.SPOTIFY_CLIENT_SECRET:
            try:
                import spotipy
                from spotipy.oauth2 import SpotifyClientCredentials
                
                auth_manager = SpotifyClientCredentials(
                    client_id=settings.SPOTIFY_CLIENT_ID, 
                    client_secret=settings.SPOTIFY_CLIENT_SECRET
                )
                sp = spotipy.Spotify(auth_manager=auth_manager)
                
                # Extract episode ID
                episode_id = re.search(r"/episode/([A-Za-z0-9]+)", url)
                if episode_id:
                    eid = episode_id.group(1)
                    ep = sp.episode(eid)
                    episode_title = ep.get("name")
                    show_name = ep.get("show", {}).get("name")
                    
                    print(f"Spotify API success: Title='{episode_title}', Show='{show_name}'")
                    return SourceResolver._search_itunes(episode_title, show_name)
            except Exception as e:
                print(f"Spotify API resolution failed: {e}")
        
        # Common headers for resolution
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        }
        
        # Try OEmbed (often more reliable than direct scraping)
        try:
            oembed_url = f"https://open.spotify.com/oembed?url={url}"
            response = requests.get(oembed_url, headers=headers, timeout=10)
            if response.status_code == 200:
                data = response.json()
                episode_title = data.get("title")
                # OEmbed often returns "Episode Title" or "Episode Title - Podcast Name"
                # We can try to extract show name if it's there, otherwise use "Podcast"
                show_name = "Podcast"
                if " - " in episode_title:
                    parts = episode_title.split(" - ")
                    # Usually title is first, but it varies. Let's send the whole thing to iTunes Search
                    # which is smart enough to handle "Title - Show" or "Show - Title"
                    pass
                
                print(f"Spotify OEmbed success: Title='{episode_title}'")
                audio_url, itunes_meta = SourceResolver._search_itunes(episode_title, show_name)
                
                if itunes_meta:
                    # Enriched metadata
                    if not itunes_meta.get("image_url") and data.get("thumbnail_url"):
                        itunes_meta["image_url"] = data.get("thumbnail_url")
                    return audio_url, itunes_meta
        except Exception as e:
            print(f"Spotify OEmbed failed: {e}")

        # Fallback to scraping (more robust headers)
        try:
            response = requests.get(url, headers=headers, timeout=10)
            print(f"Spotify scrape response status: {response.status_code}")
            
            # Find og:title (example: "AI in 2025: From Agents to Factories - Ep. 282")
            title_match = re.search(r'<meta property="og:title" content="([^"]+)"', response.text)
            if title_match:
                full_title = title_match.group(1)
                
                show_name = "Podcast"
                desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', response.text)
                if desc_match:
                    desc_text = desc_match.group(1)
                    if "by " in desc_text:
                        show_name = desc_text.split("by ")[-1].split(".")[0].strip()
                    elif "from " in desc_text:
                        show_name = desc_text.split("from ")[-1].split(" on Spotify")[0].strip()
                
                print(f"Scraping success: Title='{full_title}', Show='{show_name}'")
                return SourceResolver._search_itunes(full_title, show_name)
            else:
                print(f"Scraping failed: Could not find og:title meta tag. Text length: {len(response.text)}")
                if "Verify you're a human" in response.text:
                    print("Spotify blocked us with a bot check (Verify you're a human)")
        except Exception as e:
            print(f"Spotify scraping failed: {e}")
        
        return None, None

    @staticmethod
    def _search_itunes(episode_title: str, show_name: str) -> Tuple[Optional[str], Optional[dict]]:
        # Strategy 1: Search by show + title
        search_query = f"{show_name} {episode_title}"
        print(f"Searching iTunes (Strategy 1): {search_query}")
        response = requests.get(f"https://itunes.apple.com/search?term={search_query}&entity=podcastEpisode&limit=1")
        data = response.json()
        
        if data["resultCount"] > 0:
            episode = data["results"][0]
            print(f"Found on iTunes (S1): {episode.get('trackName')}")
            return SourceResolver._format_itunes_result(episode)

        # Strategy 2: Search by title only
        print(f"Searching iTunes (Strategy 2): {episode_title}")
        response = requests.get(f"https://itunes.apple.com/search?term={episode_title}&entity=podcastEpisode&limit=3")
        data = response.json()
        
        if data["resultCount"] > 0:
            # Try to find a result that matches the show name if possible
            for episode in data["results"]:
                if show_name.lower() in episode.get("collectionName", "").lower():
                    print(f"Found on iTunes (S2 - Match): {episode.get('trackName')}")
                    return SourceResolver._format_itunes_result(episode)
            
            # If no match but we found something, take the first one as a gamble
            episode = data["results"][0]
            print(f"Found on iTunes (S2 - First): {episode.get('trackName')}")
            return SourceResolver._format_itunes_result(episode)
        
        print("No results found on iTunes")
        return None, None

    @staticmethod
    def _format_itunes_result(episode: dict) -> Tuple[str, dict]:
        return episode.get("episodeUrl") or episode.get("previewUrl"), {
            "title": episode.get("trackName"),
            "show": episode.get("collectionName"),
            "duration": episode.get("trackTimeMillis"),
            "image_url": episode.get("artworkUrl600") or episode.get("artworkUrl100"),
            "source_guid": str(episode.get("trackId")) if episode.get("trackId") is not None else None
        }

    @staticmethod
    def _resolve_apple(url: str) -> Tuple[Optional[str], Optional[dict]]:
        # Apple Podcasts links are easier to map to iTunes Search API
        episode_id = re.search(r'id(\d+)', url)
        if not episode_id:
            return None, None
        
        response = requests.get(f"https://itunes.apple.com/lookup?id={episode_id.group(1)}&entity=podcastEpisode")
        data = response.json()
        if data["resultCount"] > 1:
            episode = data["results"][1] # Index 1 is usually the episode
            return episode.get("episodeUrl") or episode.get("previewUrl"), {
                "title": episode.get("trackName"),
                "show": episode.get("collectionName"),
                "duration": episode.get("trackTimeMillis"),
                "source_guid": str(episode.get("trackId")) if episode.get("trackId") is not None else None
            }
        return None, None

    @staticmethod
    def _resolve_rss(url: str) -> Tuple[Optional[str], Optional[dict]]:
        # Basic RSS resolver
        feed = feedparser.parse(url)
        if feed.entries:
            entry = feed.entries[0]
            for link in entry.links:
                if link.type.startswith("audio/"):
                    return link.href, {
                        "title": entry.title,
                        "show": feed.feed.title,
                        "source_guid": getattr(entry, "id", None) or getattr(entry, "guid", None)
                    }
        return None, None
