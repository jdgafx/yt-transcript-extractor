import { NextRequest, NextResponse } from "next/server";
import { fetchChannelVideos, fetchPlaylistVideos } from "@/lib/youtube";

export async function POST(request: NextRequest) {
  try {
    const { url, type } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing URL" }, { status: 400 });
    }

    const videos =
      type === "playlist" ? await fetchPlaylistVideos(url) : await fetchChannelVideos(url);

    return NextResponse.json({
      videos,
      count: videos.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch videos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
