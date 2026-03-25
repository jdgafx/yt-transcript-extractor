import { NextRequest, NextResponse } from "next/server";
import { generateMarkdown, generatePdf, generateDocx } from "@/lib/exporters";
import type { TranscriptResult } from "@/lib/youtube";

export async function POST(request: NextRequest) {
  try {
    const { results, sourceLabel, format } = (await request.json()) as {
      results: TranscriptResult[];
      sourceLabel: string;
      format: "md" | "pdf" | "docx";
    };

    if (!results || !Array.isArray(results)) {
      return NextResponse.json({ error: "No results provided" }, { status: 400 });
    }

    const safeName = (sourceLabel || "transcript")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 60);

    switch (format) {
      case "md": {
        const md = generateMarkdown(results, sourceLabel);
        return new Response(md, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${safeName}.md"`,
          },
        });
      }

      case "pdf": {
        const pdfBuffer = generatePdf(results, sourceLabel);
        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
          },
        });
      }

      case "docx": {
        const docxBuffer = await generateDocx(results, sourceLabel);
        return new Response(new Uint8Array(docxBuffer), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${safeName}.docx"`,
          },
        });
      }

      default:
        return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
