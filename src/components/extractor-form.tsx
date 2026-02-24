"use client";

import { useState, useCallback } from "react";

interface ExtractorFormProps {
  onSubmit: (url: string) => void;
  disabled: boolean;
}

export default function ExtractorForm({ onSubmit, disabled }: ExtractorFormProps) {
  const [url, setUrl] = useState("");

  const detectType = useCallback((input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const channelPatterns = [
      /youtube\.com\/@[\w.-]+/i,
      /youtube\.com\/channel\/[\w-]+/i,
      /youtube\.com\/c\/[\w.-]+/i,
      /youtube\.com\/user\/[\w.-]+/i,
    ];

    const videoPatterns = [
      /youtube\.com\/watch\?v=[\w-]{11}/i,
      /youtu\.be\/[\w-]{11}/i,
      /youtube\.com\/shorts\/[\w-]{11}/i,
    ];

    for (const p of videoPatterns) {
      if (p.test(trimmed)) return "video";
    }
    for (const p of channelPatterns) {
      if (p.test(trimmed)) return "channel";
    }
    return null;
  }, []);

  const type = detectType(url);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim() && type) {
      onSubmit(url.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="relative">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube channel or video URL..."
          disabled={disabled}
          className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 text-lg focus:outline-none focus:ring-2 focus:ring-[#FF0000]/40 focus:border-[#FF0000]/40 transition-all disabled:opacity-50"
        />
        {url.trim() && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            {type === "video" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                Single Video
              </span>
            )}
            {type === "channel" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 012 15.5v-11zM4.5 4A.5.5 0 004 4.5v11a.5.5 0 00.5.5h11a.5.5 0 00.5-.5v-11a.5.5 0 00-.5-.5h-11z" />
                </svg>
                Channel
              </span>
            )}
            {!type && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                Unknown URL
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={disabled || !type}
          className="px-8 py-3 bg-[#FF0000] text-white font-semibold rounded-xl hover:bg-[#cc0000] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/40"
        >
          {disabled ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Extracting...
            </span>
          ) : (
            "Extract Transcripts"
          )}
        </button>

        {type === "channel" && !disabled && (
          <p className="text-sm text-gray-400">
            This will fetch all videos from the channel and extract transcripts sequentially.
          </p>
        )}
      </div>
    </form>
  );
}
