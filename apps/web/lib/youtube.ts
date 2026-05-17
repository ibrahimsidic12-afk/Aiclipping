/**
 * YouTube URL parsing helpers. Centralized so the API route, validation,
 * and frontend hints all stay in sync.
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Parses a YouTube URL and returns the 11-char video id, or null if the
 * URL doesn't look like a single-video YouTube link we support.
 *
 * Accepts:
 *   - https://www.youtube.com/watch?v=ID
 *   - https://youtu.be/ID
 *   - https://www.youtube.com/shorts/ID
 *   - https://www.youtube.com/embed/ID
 *
 * Rejects: playlists (?list=), channel pages, anything non-YouTube.
 */
export function parseYoutubeVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  // Refuse playlist URLs — pipeline only handles single videos.
  if (url.searchParams.has('list')) {
    return null;
  }

  // youtu.be/<id>
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] || '';
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  // youtube.com/watch?v=<id>
  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') || '';
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  // youtube.com/shorts/<id> or /embed/<id>
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 2 && (segments[0] === 'shorts' || segments[0] === 'embed')) {
    const id = segments[1] ?? '';
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  return null;
}

/**
 * Returns the canonical watch URL for the given video id. We store this
 * on the Video row instead of the user-supplied URL so the worker can
 * always reach it the same way.
 */
export function canonicalYoutubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
