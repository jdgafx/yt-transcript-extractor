import { execFile } from "child_process";
import { readdir, readFile, rm, mkdir } from "fs/promises";
import path from "path";
import { parseSrtToText } from "./srt-parser";

const EXTRACT_DIR = "/tmp/yt-extract";
const DELAY_MS = 2500;

function exec(cmd: string, args: string[], timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${err.message}\nstderr: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

/**
 * Fetch all video IDs and titles from a channel URL.
 */
export async function fetchChannelVideos(channelUrl: string): Promise<VideoInfo[]> {
  // Append /videos to ensure we get the videos tab
  let url = channelUrl.replace(/\/$/, "");
  if (!url.endsWith("/videos")) {
    url += "/videos";
  }

  const output = await exec("yt-dlp", [
    "--flat-playlist",
    "--print",
    "%(id)s|%(title)s",
    "--no-warnings",
    url,
  ], 120000);

  const lines = output.trim().split("\n").filter(Boolean);
  const videos: VideoInfo[] = [];

  for (const line of lines) {
    const pipeIdx = line.indexOf("|");
    if (pipeIdx === -1) continue;
    const id = line.substring(0, pipeIdx).trim();
    const title = line.substring(pipeIdx + 1).trim();
    if (id && id.length === 11) {
      videos.push({ id, title });
    }
  }

  return videos;
}

/**
 * Get the title of a video by its URL.
 */
export async function getVideoTitle(videoUrl: string): Promise<string> {
  try {
    const output = await exec("yt-dlp", ["--get-title", "--no-warnings", videoUrl], 30000);
    return output.trim();
  } catch {
    return "Unknown Title";
  }
}

/**
 * Extract transcript for a single video.
 */
export async function extractTranscript(videoId: string): Promise<{ transcript: string | null; error?: string }> {
  const videoDir = path.join(EXTRACT_DIR, videoId);
  await mkdir(videoDir, { recursive: true });

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = path.join(videoDir, "%(id)s");

  // Try auto-generated subtitles first (most videos have these)
  try {
    await exec("yt-dlp", [
      "--skip-download",
      "--write-auto-sub",
      "--sub-lang", "en",
      "--sub-format", "vtt",
      "--convert-subs", "srt",
      "--no-warnings",
      "-o", outputTemplate,
      videoUrl,
    ], 45000);

    const text = await readSubtitleFile(videoDir);
    if (text) {
      await cleanupDir(videoDir);
      return { transcript: text };
    }
  } catch {
    // Fall through to manual subs
  }

  // Try manual subtitles
  try {
    await exec("yt-dlp", [
      "--skip-download",
      "--write-sub",
      "--sub-lang", "en",
      "--no-warnings",
      "-o", outputTemplate,
      videoUrl,
    ], 45000);

    const text = await readSubtitleFile(videoDir);
    if (text) {
      await cleanupDir(videoDir);
      return { transcript: text };
    }
  } catch {
    // No subtitles available
  }

  await cleanupDir(videoDir);
  return { transcript: null, error: "No English subtitles available" };
}

async function readSubtitleFile(dir: string): Promise<string | null> {
  try {
    const files = await readdir(dir);
    const subFile = files.find(
      (f) => f.endsWith(".srt") || f.endsWith(".vtt") || f.endsWith(".en.srt") || f.endsWith(".en.vtt")
    );
    if (!subFile) return null;

    const content = await readFile(path.join(dir, subFile), "utf-8");
    const text = parseSrtToText(content);
    return text.length > 10 ? text : null;
  } catch {
    return null;
  }
}

async function cleanupDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Extract transcripts for multiple videos with delay between requests.
 */
export async function extractBatch(
  videos: VideoInfo[],
  onProgress?: (completed: number, total: number, current: VideoInfo, result: TranscriptResult) => void
): Promise<TranscriptResult[]> {
  const results: TranscriptResult[] = [];

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const url = `https://www.youtube.com/watch?v=${video.id}`;

    const { transcript, error } = await extractTranscript(video.id);

    const result: TranscriptResult = {
      videoId: video.id,
      title: video.title,
      url,
      transcript,
      error,
    };

    results.push(result);
    onProgress?.(i + 1, videos.length, video, result);

    // Delay between requests to avoid rate limiting
    if (i < videos.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  return results;
}
