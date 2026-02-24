/**
 * Parse SRT/VTT subtitle content and extract plain text.
 * Strips timestamps, sequence numbers, and formatting tags.
 */
export function parseSrtToText(content: string): string {
  const lines = content.split("\n");
  const textLines: string[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    const line = raw.trim();

    // Skip empty lines
    if (!line) continue;

    // Skip VTT header
    if (line === "WEBVTT" || line.startsWith("Kind:") || line.startsWith("Language:")) continue;

    // Skip sequence numbers (pure digits)
    if (/^\d+$/.test(line)) continue;

    // Skip timestamp lines (SRT: 00:00:00,000 --> 00:00:00,000  or VTT: 00:00.000 --> 00:00.000)
    if (/^\d{2}:\d{2}[:\.]/.test(line) && line.includes("-->")) continue;

    // Skip NOTE blocks
    if (line.startsWith("NOTE")) continue;

    // Strip HTML-like tags (<c>, <i>, etc.) and VTT positioning
    let cleaned = line
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^}]+\}/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();

    if (!cleaned) continue;

    // Deduplicate consecutive identical lines (common in auto-subs)
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      textLines.push(cleaned);
    }
  }

  return textLines.join(" ").replace(/\s{2,}/g, " ").trim();
}
