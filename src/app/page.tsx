"use client";

import { useState, useCallback, useRef } from "react";
import ExtractorForm from "@/components/extractor-form";
import ProgressDisplay from "@/components/progress-display";
import DownloadButtons from "@/components/download-buttons";

interface TranscriptResult {
  videoId: string;
  title: string;
  url: string;
  transcript: string | null;
  error?: string;
}

type Phase = "idle" | "fetching-channel" | "extracting" | "done" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<TranscriptResult[]>([]);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [currentVideo, setCurrentVideo] = useState<string | undefined>();
  const [sourceLabel, setSourceLabel] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const detectType = (input: string): "video" | "channel" | "playlist" | null => {
    if (/youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\//i.test(input)) return "video";
    if (/youtube\.com\/playlist\?list=/i.test(input)) return "playlist";
    if (/youtube\.com\/@|youtube\.com\/channel\/|youtube\.com\/c\/|youtube\.com\/user\//i.test(input)) return "channel";
    return null;
  };

  const extractVideoId = (input: string): string | null => {
    const patterns = [
      /youtube\.com\/watch\?v=([\w-]{11})/i,
      /youtu\.be\/([\w-]{11})/i,
      /youtube\.com\/shorts\/([\w-]{11})/i,
    ];
    for (const p of patterns) {
      const m = input.match(p);
      if (m) return m[1];
    }
    return null;
  };

  const handleSubmit = useCallback(async (url: string) => {
    // Reset state
    setResults([]);
    setCompleted(0);
    setTotal(0);
    setError(undefined);
    setCurrentVideo(undefined);

    const type = detectType(url);
    if (!type) return;

    abortRef.current = new AbortController();

    try {
      let videos: { id: string; title: string }[] = [];

      if (type === "channel" || type === "playlist") {
        setPhase("fetching-channel");
        setSourceLabel(url);

        const res = await fetch("/api/channel-videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, type }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch videos");
        }

        const data = await res.json();
        videos = data.videos;

        if (videos.length === 0) {
          throw new Error("No videos found");
        }
      } else {
        const videoId = extractVideoId(url);
        if (!videoId) throw new Error("Could not extract video ID");
        videos = [{ id: videoId, title: "Unknown" }];
        setSourceLabel(url);
      }

      // Start extraction — one video at a time to avoid function timeouts
      setPhase("extracting");
      setTotal(videos.length);

      for (let i = 0; i < videos.length; i++) {
        if (abortRef.current?.signal.aborted) break;

        const video = videos[i];
        setCurrentVideo(video.title);

        try {
          const res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoId: video.id, title: video.title }),
            signal: abortRef.current.signal,
          });

          if (res.ok) {
            const result = await res.json();
            setResults((prev) => [...prev, result]);

            if (videos.length === 1 && result.title !== "Unknown") {
              setSourceLabel(result.title);
            }
          } else {
            setResults((prev) => [
              ...prev,
              { videoId: video.id, title: video.title, url: `https://www.youtube.com/watch?v=${video.id}`, transcript: null, error: "Request failed" },
            ]);
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") break;
          setResults((prev) => [
            ...prev,
            { videoId: video.id, title: video.title, url: `https://www.youtube.com/watch?v=${video.id}`, transcript: null, error: "Network error" },
          ]);
        }

        setCompleted(i + 1);

        // Delay between requests to avoid rate limiting
        if (i < videos.length - 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      setPhase("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setPhase("error");
    }
  }, []);

  const handleReset = () => {
    abortRef.current?.abort();
    setPhase("idle");
    setResults([]);
    setCompleted(0);
    setTotal(0);
    setError(undefined);
    setCurrentVideo(undefined);
    setSourceLabel("");
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Real YouTube Play Button Logo */}
            <div className="w-12 h-8 rounded-lg bg-[#FF0000] flex items-center justify-center shadow-lg shadow-red-500/30">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                YouTube Transcript <span className="text-[#FF0000]">Auto-Extractor</span>
              </h1>
              <p className="text-xs text-gray-500">Extract transcripts from any YouTube video or channel</p>
            </div>
          </div>
          {phase !== "idle" && (
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
            >
              Start Over
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-start">
        <div className="w-full max-w-4xl mx-auto px-6 py-12 space-y-8">
          {/* Hero section (only when idle) */}
          {phase === "idle" && (
            <div className="text-center space-y-3 mb-4">
              <h2 className="text-3xl font-bold text-white">
                Extract <span className="text-[#FF0000]">YouTube</span> Transcripts
              </h2>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                Paste a video or channel URL to extract transcripts. Download as Markdown, PDF, or Word.
              </p>
            </div>
          )}

          {/* Form */}
          <div className="glow-red rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
            <ExtractorForm
              onSubmit={handleSubmit}
              disabled={phase === "fetching-channel" || phase === "extracting"}
            />
          </div>

          {/* Progress */}
          {phase !== "idle" && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
              <ProgressDisplay
                phase={phase}
                completed={completed}
                total={total}
                results={results}
                error={error}
                currentVideo={currentVideo}
              />
            </div>
          )}

          {/* Download buttons */}
          {phase === "done" && results.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
              <DownloadButtons results={results} sourceLabel={sourceLabel} />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-gray-600">
          <p>Built by <span className="text-gray-400">Christopher Gentile</span> / <span className="text-[#FF0000]">NewDawn AI</span></p>
          <p>Powered by <span className="text-gray-400">YouTube API</span></p>
        </div>
      </footer>
    </main>
  );
}
