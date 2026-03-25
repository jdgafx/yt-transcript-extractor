/**
 * Cloudflare Worker — YouTube transcript proxy.
 * Tries multiple innertube clients with retry + backoff.
 */

const ALLOWED_ORIGINS = [
  "https://yt-transcript-tool-newdawn.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

const KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const CLIENTS = [
  {
    name: "IOS",
    client: { clientName: "IOS", clientVersion: "20.10.4" },
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)",
  },
  {
    name: "ANDROID",
    client: { clientName: "ANDROID", clientVersion: "20.10.38" },
    ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
  },
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function decodeEntities(s) {
  return s
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function parseTranscript(xml) {
  const segments = [];
  const pRegex = /<p\s+t="\d+"\s+d="\d+"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = pRegex.exec(xml)) !== null) {
    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let s;
    while ((s = sRegex.exec(m[1])) !== null) text += s[1];
    if (!text) text = m[1].replace(/<[^>]+>/g, "");
    text = decodeEntities(text).trim();
    if (text) segments.push(text);
  }
  if (segments.length === 0) {
    const tRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    while ((m = tRegex.exec(xml)) !== null) {
      const cleaned = decodeEntities(m[1].replace(/<[^>]+>/g, "").replace(/\n/g, " ")).trim();
      if (cleaned) segments.push(cleaned);
    }
  }
  return segments.join(" ").replace(/\s{2,}/g, " ").trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryClient(videoId, clientConfig, attempt = 0) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${KEY}&prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": clientConfig.ua },
    body: JSON.stringify({ context: { client: clientConfig.client }, videoId }),
  });

  // Rate limited — retry with backoff
  if (res.status === 429 && attempt < 2) {
    await sleep(3000 * (attempt + 1));
    return tryClient(videoId, clientConfig, attempt + 1);
  }

  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const player = await res.json();
  const status = player?.playabilityStatus?.status;

  if (status !== "OK") {
    const reason = player?.playabilityStatus?.reason || status;
    // Bot detection — retry once with delay
    if (/bot|sign in|confirm/i.test(reason) && attempt < 1) {
      await sleep(5000);
      return tryClient(videoId, clientConfig, attempt + 1);
    }
    return { ok: false, error: reason };
  }

  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) return { ok: false, error: "No captions" };

  const track =
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ||
    tracks.find((t) => t.languageCode === "en") ||
    tracks.find((t) => t.languageCode?.startsWith("en")) ||
    tracks[0];

  if (!track?.baseUrl) return { ok: false, error: "No caption URL" };

  const capRes = await fetch(track.baseUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });

  if (!capRes.ok) return { ok: false, error: `Caption fetch HTTP ${capRes.status}` };
  const xml = await capRes.text();
  if (!xml) return { ok: false, error: "Empty captions" };

  const transcript = parseTranscript(xml);
  if (transcript.length < 10) return { ok: false, error: "Too short" };

  return { ok: true, transcript, lang: track.languageCode };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders(origin) });
    }

    try {
      const { videoId } = await request.json();
      if (!videoId || typeof videoId !== "string" || videoId.length !== 11) {
        return Response.json({ error: "Invalid video ID" }, { status: 400, headers: corsHeaders(origin) });
      }

      const errors = [];
      for (const clientConfig of CLIENTS) {
        try {
          const result = await tryClient(videoId, clientConfig);
          if (result.ok) {
            return Response.json(
              { transcript: result.transcript, lang: result.lang, client: clientConfig.name },
              { status: 200, headers: corsHeaders(origin) }
            );
          }
          errors.push(`${clientConfig.name}: ${result.error}`);
        } catch (e) {
          errors.push(`${clientConfig.name}: ${e.message}`);
        }
      }

      return Response.json(
        { transcript: null, error: errors.join("; ") },
        { status: 200, headers: corsHeaders(origin) }
      );
    } catch (err) {
      return Response.json(
        { error: err.message || "Internal error" },
        { status: 500, headers: corsHeaders(origin) }
      );
    }
  },
};
