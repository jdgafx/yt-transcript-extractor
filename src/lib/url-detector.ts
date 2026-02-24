export type InputType = "channel" | "video" | "unknown";

export interface DetectionResult {
  type: InputType;
  url: string;
  videoId?: string;
  label: string;
}

const CHANNEL_PATTERNS = [
  /youtube\.com\/@[\w.-]+/i,
  /youtube\.com\/channel\/[\w-]+/i,
  /youtube\.com\/c\/[\w.-]+/i,
  /youtube\.com\/user\/[\w.-]+/i,
];

const VIDEO_PATTERNS = [
  /youtube\.com\/watch\?v=([\w-]{11})/i,
  /youtu\.be\/([\w-]{11})/i,
  /youtube\.com\/shorts\/([\w-]{11})/i,
  /youtube\.com\/embed\/([\w-]{11})/i,
  /youtube\.com\/v\/([\w-]{11})/i,
];

export function detectUrlType(input: string): DetectionResult {
  const trimmed = input.trim();

  for (const pattern of VIDEO_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type: "video",
        url: trimmed,
        videoId: match[1],
        label: `Single video (ID: ${match[1]})`,
      };
    }
  }

  for (const pattern of CHANNEL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        type: "channel",
        url: trimmed,
        label: `YouTube channel`,
      };
    }
  }

  return {
    type: "unknown",
    url: trimmed,
    label: "Could not detect URL type",
  };
}
