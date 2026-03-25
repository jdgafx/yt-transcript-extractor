import { NextRequest } from "next/server";
import { extractTranscript, getVideoTitle, type TranscriptResult, type VideoInfo } from "@/lib/youtube";

export const maxDuration = 300; // 5 minutes for Vercel/Netlify

/**
 * POST /api/extract
 * Body: { videos: VideoInfo[] }
 *
 * Streams progress as newline-delimited JSON (NDJSON).
 * Each line is either:
 *   { type: "progress", completed, total, result: TranscriptResult }
 *   { type: "done", results: TranscriptResult[] }
 *   { type: "error", message: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let videos: VideoInfo[] = body.videos;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return new Response(
        JSON.stringify({ type: "error", message: "No videos provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // For single video where we may not have the title yet
    for (const v of videos) {
      if (!v.title || v.title === "Unknown") {
        v.title = await getVideoTitle(`https://www.youtube.com/watch?v=${v.id}`);
      }
    }

    const encoder = new TextEncoder();
    const results: TranscriptResult[] = [];

    const stream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < videos.length; i++) {
          const video = videos[i];
          const url = `https://www.youtube.com/watch?v=${video.id}`;

          try {
            const { transcript, error } = await extractTranscript(video.id);

            const result: TranscriptResult = {
              videoId: video.id,
              title: video.title,
              url,
              transcript,
              error,
            };

            results.push(result);

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "progress",
                  completed: i + 1,
                  total: videos.length,
                  result,
                }) + "\n"
              )
            );
          } catch (err) {
            const result: TranscriptResult = {
              videoId: video.id,
              title: video.title,
              url,
              transcript: null,
              error: err instanceof Error ? err.message : "Extraction failed",
            };

            results.push(result);

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "progress",
                  completed: i + 1,
                  total: videos.length,
                  result,
                }) + "\n"
              )
            );
          }

          // Delay between requests
          if (i < videos.length - 1) {
            await new Promise((r) => setTimeout(r, 4000));
          }
        }

        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "done", results }) + "\n"
          )
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return new Response(
      JSON.stringify({ type: "error", message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
