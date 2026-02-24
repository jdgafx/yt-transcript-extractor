import { NextRequest, NextResponse } from "next/server";
import { fetchChannelVideos } from "@/lib/yt-dlp";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing URL" }, { status: 400 });
    }

    const videos = await fetchChannelVideos(url);

    return NextResponse.json({
      videos,
      count: videos.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch channel videos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
