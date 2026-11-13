/**
 * How Cloudinary files are recorded in the database. Private files are not
 * stored as delivery URLs (those need a fresh signature) but as a reference
 * `cloudinary://<resource_type>/<delivery_type>/<public_id>`, e.g.
 * `cloudinary://raw/authenticated/lms/lessons/lessons-1700000000-ab12cd34.pdf`.
 * Public images (avatars, course covers) keep their https URL.
 */

export type CloudinaryResourceType = 'image' | 'video' | 'raw';
export type CloudinaryDeliveryType = 'upload' | 'authenticated';

export interface CloudinaryRef {
  resourceType: CloudinaryResourceType;
  type: CloudinaryDeliveryType;
  publicId: string;
}

export const CLOUDINARY_SCHEME = 'cloudinary://';

/** Root folder of everything this app uploads. */
export const CLOUDINARY_ROOT = 'lms';

/** Free-plan upload limits; raise with CLOUDINARY_MAX_FILE_MB / _VIDEO_MB. */
export const CLOUDINARY_DEFAULT_MAX_FILE_MB = 10;
export const CLOUDINARY_DEFAULT_MAX_VIDEO_MB = 100;

export function formatRef(ref: CloudinaryRef): string {
  return `${CLOUDINARY_SCHEME}${ref.resourceType}/${ref.type}/${ref.publicId}`;
}

export function parseRef(url: string | null | undefined): CloudinaryRef | null {
  if (!url?.startsWith(CLOUDINARY_SCHEME)) return null;
  const m =
    /^cloudinary:\/\/(image|video|raw)\/(upload|authenticated)\/([\w./-]+)$/.exec(
      url,
    );
  if (!m || m[3].includes('..')) return null;
  return {
    resourceType: m[1] as CloudinaryResourceType,
    type: m[2] as CloudinaryDeliveryType,
    publicId: m[3],
  };
}

/** Folder (avatars, lessons, …) of a reference made by this app. */
export function refFolder(ref: CloudinaryRef): string | null {
  const m = new RegExp(`^${CLOUDINARY_ROOT}/([a-z-]+)/`).exec(ref.publicId);
  return m ? m[1] : null;
}

/**
 * Cloudinary handles images and videos itself; everything else (PDF, office
 * documents, archives, code) goes in as `raw` so the original bytes come back
 * unchanged — PDFs uploaded as images would be rasterised and, on free
 * accounts, blocked from delivery.
 */
export function resourceTypeFor(mime: string): CloudinaryResourceType {
  if (/^image\/(png|jpe?g|gif|webp)$/.test(mime)) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'raw';
}
