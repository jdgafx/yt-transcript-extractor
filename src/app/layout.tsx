import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YT Transcript Extractor",
  description: "Extract transcripts from YouTube videos and channels. Export to Markdown, PDF, or Word.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-grid antialiased">
        {children}
      </body>
    </html>
  );
}
