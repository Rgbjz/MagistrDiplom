/**
 * Pure helpers for HLS transcoding and delivery: ffmpeg argument builders,
 * metadata parsing, playlists. Kept free of I/O so they are unit-testable.
 */

export interface SourceInfo {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export interface Rendition {
  /** Output height, e.g. 720. Also the file stem: "720p.m3u8". */
  height: number;
  width: number;
  videoKbps: number;
  audioKbps: number;
}

/** Segment length in seconds; keyframes are forced on this boundary. */
export const SEGMENT_SECONDS = 6;

export const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

/** 2 GB: the client upload limit. */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

/** Files a client may request for one video. */
export const HLS_FILE =
  /^(master\.m3u8|\d{3,4}p\.m3u8|\d{3,4}p_\d{3,5}\.ts|poster\.jpg|source\.mp4)$/;

/**
 * Parses `ffmpeg -hide_banner -i <file>` stderr (no ffprobe needed):
 * "Duration: 00:01:02.50, …" and "Stream #0:0…: Video: h264 …, 1280x720 …".
 */
export function parseSourceInfo(stderr: string): SourceInfo | null {
  const d = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  const v = /Stream #\d+:\d+[^\n]*?Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(
    stderr,
  );
  if (!d || !v) return null;
  const durationSec = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  let width = Number(v[1]);
  let height = Number(v[2]);
  // Phone videos store rotation as metadata; the visible frame is swapped.
  if (/rotate\s*:\s*-?(90|270)\b|rotation of -?(90|270)/.test(stderr)) {
    [width, height] = [height, width];
  }
  return {
    durationSec,
    width,
    height,
    hasAudio: /Stream #\d+:\d+[^\n]*?Audio:/.test(stderr),
  };
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** 720p and 360p for HD sources, a single rendition (≤ 360p) otherwise. */
export function renditionsFor(
  src: Pick<SourceInfo, 'width' | 'height'>,
): Rendition[] {
  const heights =
    src.height >= 720 ? [720, 360] : [Math.min(360, even(src.height))];
  return heights.map((height) => ({
    height,
    width: even((src.width * height) / src.height),
    videoKbps: height >= 720 ? 2800 : 800,
    audioKbps: height >= 720 ? 128 : 96,
  }));
}

/** ffmpeg args for one VOD HLS rendition (H.264 + AAC), progress on stdout. */
export function hlsArgs(
  input: string,
  outDir: string,
  r: Rendition,
  hasAudio: boolean,
): string[] {
  const stem = `${r.height}p`;
  return [
    '-hide_banner',
    '-nostats',
    '-y',
    '-i',
    input,
    '-progress',
    'pipe:1',
    '-map',
    '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0'] : []),
    '-vf',
    `scale=${r.width}:${r.height}`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    `${r.videoKbps}k`,
    '-maxrate',
    `${Math.round(r.videoKbps * 1.07)}k`,
    '-bufsize',
    `${r.videoKbps * 2}k`,
    '-force_key_frames',
    `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    '-sc_threshold',
    '0',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', `${r.audioKbps}k`, '-ac', '2'] : []),
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_filename',
    `${outDir}/${stem}_%03d.ts`,
    `${outDir}/${stem}.m3u8`,
  ];
}

/** ffmpeg args for a JPEG poster taken at 10 % of the duration. */
export function posterArgs(
  input: string,
  output: string,
  durationSec: number,
): string[] {
  const at = Math.max(0, Math.min(durationSec * 0.1, durationSec - 0.1));
  return [
    '-hide_banner',
    '-y',
    '-ss',
    at.toFixed(2),
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    'scale=-2:720:force_original_aspect_ratio=decrease',
    '-q:v',
    '3',
    output,
  ];
}

/** Microseconds processed so far, from a `-progress` line (or null). */
export function progressMicros(line: string): number | null {
  const m = /^out_time_(?:us|ms)=(\d+)$/.exec(line.trim());
  return m ? Number(m[1]) : null;
}

export function masterPlaylist(renditions: Rendition[]): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const r of renditions) {
    const bandwidth = (r.videoKbps + r.audioKbps) * 1000;
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${r.width}x${r.height},NAME="${r.height}p"`,
      `${r.height}p.m3u8`,
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Appends the signature query to every URI in a playlist so each variant and
 * segment request carries it (URIs stay relative to the playlist URL).
 */
export function signPlaylist(text: string, query: string): string {
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return line;
      if (!HLS_FILE.test(t)) return line;
      return `${t}?${query}`;
    })
    .join('\n');
}

/** Checks the container magic bytes of an MP4/MOV or WebM file. */
export function looksLikeVideo(head: Buffer): boolean {
  if (head.length < 12) return false;
  const ftyp = head.subarray(4, 8).toString('ascii') === 'ftyp';
  const ebml =
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3;
  return ftyp || ebml;
}
