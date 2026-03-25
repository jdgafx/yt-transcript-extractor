"use client";

import type { TranscriptResult } from "@/lib/youtube";

interface ProgressDisplayProps {
  phase: "idle" | "fetching-channel" | "extracting" | "done" | "error";
  completed: number;
  total: number;
  results: TranscriptResult[];
  error?: string;
  currentVideo?: string;
}

export default function ProgressDisplay({
  phase,
  completed,
  total,
  results,
  error,
  currentVideo,
}: ProgressDisplayProps) {
  if (phase === "idle") return null;

  const successCount = results.filter((r) => r.transcript).length;
  const failCount = results.filter((r) => !r.transcript).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="w-full space-y-4">
      {/* Phase indicator */}
      {phase === "fetching-channel" && (
        <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <svg className="animate-spin w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-blue-300 font-medium">Fetching video list from channel...</span>
        </div>
      )}

      {phase === "error" && error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-red-400 font-medium">Error: {error}</p>
        </div>
      )}

      {/* Progress bar */}
      {(phase === "extracting" || phase === "done") && total > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">
              {phase === "done" ? "Complete" : `Extracting transcripts... ${completed} of ${total}`}
            </span>
            <span className="text-white font-mono font-semibold">{pct}%</span>
          </div>
          <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                phase === "done"
                  ? "bg-[#FF0000]"
                  : "bg-[#FF0000] animate-pulse"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {phase === "extracting" && currentVideo && (
            <p className="text-xs text-gray-500 truncate">
              Current: {currentVideo}
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-white/5 rounded-lg text-center">
            <p className="text-2xl font-bold text-white">{results.length}</p>
            <p className="text-xs text-gray-500 mt-1">Processed</p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg text-center">
            <p className="text-2xl font-bold text-[#FF0000]">{successCount}</p>
            <p className="text-xs text-gray-500 mt-1">Transcribed</p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg text-center">
            <p className="text-2xl font-bold text-amber-400">{failCount}</p>
            <p className="text-xs text-gray-500 mt-1">Skipped</p>
          </div>
        </div>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {results.map((r, i) => (
            <div
              key={r.videoId + i}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] text-sm"
            >
              {r.transcript ? (
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
                  &#10003;
                </span>
              ) : (
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs">
                  &#8212;
                </span>
              )}
              <span className="text-gray-300 truncate flex-1">{r.title}</span>
              {r.transcript && (
                <span className="text-xs text-gray-600 flex-shrink-0">
                  {(r.transcript.length / 1000).toFixed(1)}k chars
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
