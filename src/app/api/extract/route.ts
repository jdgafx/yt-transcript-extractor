import { NextRequest } from "next/server";
import { extractTranscript, getVideoTitle, type TranscriptResult } from "@/lib/youtube";

/**
 * POST /api/extract
 * Body: { videoId: string, title?: string }
 *
 * Extracts transcript for a SINGLE video (keeps each request fast,
 * avoids Netlify's 26s function timeout).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, title } = body as { videoId: string; title?: string };

    if (!videoId || typeof videoId !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing videoId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Resolve title if needed
    let videoTitle = title || "Unknown";
    if (videoTitle === "Unknown") {
      videoTitle = await getVideoTitle(videoId);
    }

    const { transcript, error } = await extractTranscript(videoId);

    const result: TranscriptResult = {
      videoId,
      title: videoTitle,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      transcript,
      error,
    };

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
