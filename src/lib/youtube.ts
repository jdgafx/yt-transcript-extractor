/**
 * Pure JS YouTube client — no system dependencies (no yt-dlp).
 * Works on Netlify, Vercel, or any serverless environment.
 *
 * Uses YouTube's innertube API and timedtext API directly via fetch.
 */

export interface VideoInfo {
  id: string;
  title: string;
}

export interface TranscriptResult {
  videoId: string;
  title: string;
  url: string;
  transcript: string | null;
  error?: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const INNERTUBE_CONTEXT = {
  client: { clientName: "WEB", clientVersion: "2.20250301.00.00", hl: "en", gl: "US" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a JSON object from HTML by finding the variable assignment
 * and counting braces. Much faster and safer than regex on ~1MB HTML.
 */
function extractJsonFromHtml(html: string, varName: string): any {
  const needle = `var ${varName} = `;
  const start = html.indexOf(needle);
  if (start === -1) return null;

  const jsonStart = start + needle.length;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1), 10)));
}

/** Recursively extract video renderers from any YouTube API blob. */
function extractVideos(data: unknown): VideoInfo[] {
  const videos: VideoInfo[] = [];
  const seen = new Set<string>();

  function add(id: string, title: string) {
    if (id && id.length === 11 && !seen.has(id)) {
      seen.add(id);
      videos.push({ id, title: title || "Unknown" });
    }
  }

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const o = obj as Record<string, any>;

    for (const key of [
      "videoRenderer",
      "gridVideoRenderer",
      "playlistVideoRenderer",
      "compactVideoRenderer",
      "reelItemRenderer",
    ]) {
      if (o[key]?.videoId) {
        const r = o[key];
        add(r.videoId, r.title?.runs?.[0]?.text ?? r.title?.simpleText ?? r.headline?.simpleText);
        return;
      }
    }

    if (o.richItemRenderer?.content) {
      walk(o.richItemRenderer.content);
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
    } else {
      for (const val of Object.values(o)) {
        if (val && typeof val === "object") walk(val);
      }
    }
  }

  walk(data);
  return videos;
}

/** Find continuation tokens in YouTube API responses. */
function findContinuationTokens(data: unknown): string[] {
  const tokens: string[] = [];

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;
    const o = obj as Record<string, any>;

    if (o.continuationEndpoint?.continuationCommand?.token) {
      tokens.push(o.continuationEndpoint.continuationCommand.token);
      return;
    }
    if (o.continuationCommand?.token) {
      tokens.push(o.continuationCommand.token);
      return;
    }

    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
    } else {
      for (const val of Object.values(o)) {
        if (val && typeof val === "object") walk(val);
      }
    }
  }

  walk(data);
  return [...new Set(tokens)];
}

/** Fetch a continuation page from YouTube's innertube browse API. */
async function fetchContinuation(
  token: string
): Promise<{ videos: VideoInfo[]; nextTokens: string[] }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({ context: INNERTUBE_CONTEXT, continuation: token }),
      }
    );
    if (!res.ok) return { videos: [], nextTokens: [] };
    const data = await res.json();
    return { videos: extractVideos(data), nextTokens: findContinuationTokens(data) };
  } catch {
    return { videos: [], nextTokens: [] };
  }
}

// ---------------------------------------------------------------------------
// Channel videos
// ---------------------------------------------------------------------------

export async function fetchChannelVideos(channelUrl: string): Promise<VideoInfo[]> {
  let url = channelUrl.trim().replace(/\/$/, "");
  // Strip existing tab paths
  url = url.replace(
    /\/(videos|shorts|streams|playlists|community|channels|about|featured)\/?$/,
    ""
  );
  url += "/videos";

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`Failed to fetch channel: HTTP ${res.status}`);
  const html = await res.text();

  const initialData = extractJsonFromHtml(html, "ytInitialData");
  if (!initialData) throw new Error("Could not parse YouTube channel data");

  const allVideos = extractVideos(initialData);

  // Follow continuations to fetch ALL videos
  let tokens = findContinuationTokens(initialData);
  let iterations = 0;
  while (tokens.length > 0 && iterations < 100) {
    iterations++;
    const { videos: more, nextTokens } = await fetchContinuation(tokens[0]);
    if (more.length === 0) break;

    const existingIds = new Set(allVideos.map((v) => v.id));
    for (const v of more) {
      if (!existingIds.has(v.id)) {
        allVideos.push(v);
        existingIds.add(v.id);
      }
    }
    tokens = nextTokens;
    await new Promise((r) => setTimeout(r, 300));
  }

  if (allVideos.length === 0) {
    throw new Error("No videos found on this channel");
  }
  return allVideos;
}

// ---------------------------------------------------------------------------
// Playlist videos
// ---------------------------------------------------------------------------

export async function fetchPlaylistVideos(playlistUrl: string): Promise<VideoInfo[]> {
  const listMatch = playlistUrl.match(/[?&]list=([\w-]+)/);
  if (!listMatch) throw new Error("Could not extract playlist ID from URL");

  const res = await fetch(playlistUrl, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`Failed to fetch playlist: HTTP ${res.status}`);
  const html = await res.text();

  const match = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
  if (!match) throw new Error("Could not parse playlist data");

  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    throw new Error("Failed to parse playlist JSON");
  }

  const allVideos = extractVideos(data);

  let tokens = findContinuationTokens(data);
  let iterations = 0;
  while (tokens.length > 0 && iterations < 100) {
    iterations++;
    const { videos: more, nextTokens } = await fetchContinuation(tokens[0]);
    if (more.length === 0) break;
    const ids = new Set(allVideos.map((v) => v.id));
    for (const v of more) if (!ids.has(v.id)) allVideos.push(v);
    tokens = nextTokens;
    await new Promise((r) => setTimeout(r, 300));
  }

  if (allVideos.length === 0) throw new Error("No videos found in this playlist");
  return allVideos;
}

// ---------------------------------------------------------------------------
// Video title (lightweight oEmbed lookup)
// ---------------------------------------------------------------------------

export async function getVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { "User-Agent": UA } }
    );
    if (res.ok) {
      const d = await res.json();
      return d.title || "Unknown";
    }
  } catch {}
  return "Unknown";
}

// ---------------------------------------------------------------------------
// Transcript extraction via Android innertube player API
// ---------------------------------------------------------------------------

const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)";
const ANDROID_CLIENT = { clientName: "ANDROID", clientVersion: "20.10.38" };

export async function extractTranscript(
  videoId: string
): Promise<{ transcript: string | null; error?: string }> {
  try {
    // Use the Android innertube player API to get caption track URLs
    const playerRes = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
        body: JSON.stringify({
          context: { client: ANDROID_CLIENT },
          videoId,
        }),
      }
    );

    if (!playerRes.ok) return { transcript: null, error: `Player API HTTP ${playerRes.status}` };

    const player = await playerRes.json();

    if (player?.playabilityStatus?.status !== "OK") {
      return { transcript: null, error: player?.playabilityStatus?.reason || "Video unavailable" };
    }

    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) {
      return { transcript: null, error: "No captions available" };
    }

    // Prefer manual English, then any English, then first available
    const track =
      tracks.find((t: any) => t.languageCode === "en" && t.kind !== "asr") ??
      tracks.find((t: any) => t.languageCode === "en") ??
      tracks.find((t: any) => t.languageCode?.startsWith("en")) ??
      tracks[0];

    if (!track?.baseUrl) return { transcript: null, error: "No caption URL found" };

    // Fetch the timedtext XML
    const captionRes = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
    if (!captionRes.ok) return { transcript: null, error: "Failed to fetch captions" };

    const xml = await captionRes.text();
    if (!xml) return { transcript: null, error: "Empty caption response" };

    // Parse captions — try new <p> format first, fall back to <text> format
    const segments: string[] = [];

    const pRegex = /<p\s+t="\d+"\s+d="\d+"[^>]*>([\s\S]*?)<\/p>/g;
    let m: RegExpExecArray | null;
    while ((m = pRegex.exec(xml)) !== null) {
      // Extract text from <s> sub-elements if present, otherwise use raw content
      let text = "";
      const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
      let s: RegExpExecArray | null;
      while ((s = sRegex.exec(m[1])) !== null) text += s[1];
      if (!text) text = m[1].replace(/<[^>]+>/g, "");
      text = decodeHtmlEntities(text).trim();
      if (text) segments.push(text);
    }

    // Fallback to old <text> format
    if (segments.length === 0) {
      const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
      while ((m = textRegex.exec(xml)) !== null) {
        const cleaned = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, "").replace(/\n/g, " ")).trim();
        if (cleaned) segments.push(cleaned);
      }
    }

    const transcript = segments.join(" ").replace(/\s{2,}/g, " ").trim();
    if (transcript.length < 10) {
      return { transcript: null, error: "Transcript too short or empty" };
    }

    return { transcript };
  } catch (err) {
    return {
      transcript: null,
      error: err instanceof Error ? err.message : "Transcript extraction failed",
    };
  }
}
