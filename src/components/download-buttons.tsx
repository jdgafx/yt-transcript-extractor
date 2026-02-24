"use client";

import { useState } from "react";
import type { TranscriptResult } from "@/lib/yt-dlp";

interface DownloadButtonsProps {
  results: TranscriptResult[];
  sourceLabel: string;
}

export default function DownloadButtons({ results, sourceLabel }: DownloadButtonsProps) {
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (format: "md" | "pdf" | "docx") => {
    setDownloading(format);
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results, sourceLabel, format }),
      });

      if (!res.ok) {
        throw new Error("Download failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = sourceLabel.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 60);

      const ext = format;
      a.href = url;
      a.download = `${safeName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      alert("Download failed. Please try again.");
    } finally {
      setDownloading(null);
    }
  };

  const successCount = results.filter((r) => r.transcript).length;
  if (successCount === 0) return null;

  return (
    <div className="w-full space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Download Transcripts ({successCount} video{successCount !== 1 ? "s" : ""})
      </h3>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleDownload("md")}
          disabled={downloading !== null}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-600 disabled:opacity-40"
        >
          {downloading === "md" ? (
            <Spinner />
          ) : (
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          Markdown (.md)
        </button>

        <button
          onClick={() => handleDownload("pdf")}
          disabled={downloading !== null}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-600 disabled:opacity-40"
        >
          {downloading === "pdf" ? (
            <Spinner />
          ) : (
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          )}
          PDF (.pdf)
        </button>

        <button
          onClick={() => handleDownload("docx")}
          disabled={downloading !== null}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-600 disabled:opacity-40"
        >
          {downloading === "docx" ? (
            <Spinner />
          ) : (
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          Word (.docx)
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
