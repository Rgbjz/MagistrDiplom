import type { Lesson } from './types';

/** The 11-character id of a YouTube watch / youtu.be / embed link. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      id = u.pathname.startsWith('/embed/') ? u.pathname.split('/')[2] : u.searchParams.get('v');
    } else if (u.hostname === 'youtu.be') {
      id = u.pathname.slice(1);
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Small preview picture for a lesson in lists: the poster of an uploaded
 * (ready) video, otherwise YouTube's thumbnail of a linked one.
 */
export function lessonPreview(lesson: Pick<Lesson, 'videoUrl' | 'video'>): string | null {
  if (lesson.video?.status === 'READY' && lesson.video.posterUrl) return lesson.video.posterUrl;
  const id = youtubeId(lesson.videoUrl);
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}
