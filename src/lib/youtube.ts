/**
 * Pure JS YouTube client — no system dependencies (no yt-dlp).
 * Works on Netlify, Vercel, or any serverless environment.
 *
 * Uses YouTube's innertube JSON API directly — no HTML scraping.
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

/** POST to innertube browse API. */
async function innertubeBrowse(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, ...body }),
    }
  );
  if (!res.ok) throw new Error(`Innertube API HTTP ${res.status}`);
  return res.json();
}

/** Fetch a continuation page. */
async function fetchContinuation(
  token: string
): Promise<{ videos: VideoInfo[]; nextTokens: string[] }> {
  try {
    const data = await innertubeBrowse({ continuation: token });
    return { videos: extractVideos(data), nextTokens: findContinuationTokens(data) };
  } catch {
    return { videos: [], nextTokens: [] };
  }
}

/** Collect all videos by following continuation tokens. */
async function collectAllVideos(initialData: any): Promise<VideoInfo[]> {
  const allVideos = extractVideos(initialData);
  let tokens = findContinuationTokens(initialData);
  let iterations = 0;

  while (tokens.length > 0 && iterations < 50) {
    iterations++;
    const { videos: more, nextTokens } = await fetchContinuation(tokens[0]);
    if (more.length === 0) break;
    const ids = new Set(allVideos.map((v) => v.id));
    for (const v of more) if (!ids.has(v.id)) allVideos.push(v);
    tokens = nextTokens;
  }

  return allVideos;
}

// ---------------------------------------------------------------------------
// Resolve channel URL → browseId (pure innertube, no HTML)
// ---------------------------------------------------------------------------

async function resolveChannelId(channelUrl: string): Promise<string> {
  let url = channelUrl.trim().replace(/\/$/, "");
  url = url.replace(
    /\/(videos|shorts|streams|playlists|community|channels|about|featured)\/?$/,
    ""
  );

  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/navigation/resolve_url?key=${INNERTUBE_KEY}&prettyPrint=false`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ context: INNERTUBE_CONTEXT, url }),
    }
  );

  if (!res.ok) throw new Error(`Failed to resolve channel: HTTP ${res.status}`);
  const data = await res.json();
  const browseId = data?.endpoint?.browseEndpoint?.browseId;
  if (!browseId) throw new Error("Could not resolve channel URL");
  return browseId;
}

// ---------------------------------------------------------------------------
// Channel videos (pure innertube JSON API — no HTML scraping)
// ---------------------------------------------------------------------------

export async function fetchChannelVideos(channelUrl: string): Promise<VideoInfo[]> {
  const browseId = await resolveChannelId(channelUrl);

  // params "EgZ2aWRlb3PyBgQKAjoA" = Videos tab, sorted by date
  const data = await innertubeBrowse({
    browseId,
    params: "EgZ2aWRlb3PyBgQKAjoA",
  });

  const allVideos = await collectAllVideos(data);

  if (allVideos.length === 0) {
    throw new Error("No videos found on this channel");
  }
  return allVideos;
}

// ---------------------------------------------------------------------------
// Playlist videos (pure innertube JSON API)
// ---------------------------------------------------------------------------

export async function fetchPlaylistVideos(playlistUrl: string): Promise<VideoInfo[]> {
  const listMatch = playlistUrl.match(/[?&]list=([\w-]+)/);
  if (!listMatch) throw new Error("Could not extract playlist ID from URL");

  const data = await innertubeBrowse({ browseId: `VL${listMatch[1]}` });
  const allVideos = await collectAllVideos(data);

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
// Transcript extraction via Cloudflare Worker proxy
// (YouTube blocks AWS Lambda / serverless IPs — Cloudflare edge IPs work)
// ---------------------------------------------------------------------------

const TRANSCRIPT_PROXY = "https://yt-transcript-proxy.cgdarkstardev1-6e1.workers.dev";

export async function extractTranscript(
  videoId: string
): Promise<{ transcript: string | null; error?: string }> {
  try {
    const res = await fetch(TRANSCRIPT_PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });

    if (!res.ok) {
      return { transcript: null, error: `Proxy HTTP ${res.status}` };
    }

    const data = await res.json();
    return {
      transcript: data.transcript || null,
      error: data.error,
    };
  } catch (err) {
    return {
      transcript: null,
      error: err instanceof Error ? err.message : "Transcript extraction failed",
    };
  }
}
