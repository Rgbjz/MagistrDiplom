'use client';

import { getSession } from 'next-auth/react';
import { API_URL } from '../env';
import type { LessonVideo } from '../types';

export const VIDEO_UPLOAD_ACCEPT = '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime';
export const VIDEO_UPLOAD_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const VIDEO_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;

type Init =
  | { mode: 'chunked'; uploadId: string; chunkSize: number; totalChunks: number }
  | { mode: 'blob'; pathname: string; handleUploadUrl: string; maxSize: number };

async function token(): Promise<string | undefined> {
  return (await getSession())?.accessToken;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status} ${path}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** MIME type for files whose type the browser leaves empty (.mov on some OSes). */
export function videoMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
}

export class UploadPaused extends Error {}

/**
 * Uploads a lesson video without passing it through the API's memory:
 * resumable 8 MB chunks to the API's disk (local), or straight to Vercel
 * Blob when the backend has a Blob token. Resolves with the LessonVideo
 * (status PROCESSING) once the server has queued transcoding.
 */
export class VideoUpload {
  private paused = false;
  private xhr: XMLHttpRequest | null = null;
  private blobAbort: AbortController | null = null;
  private init: Init | null = null;
  /** Bytes of fully stored chunks + the chunk in flight. */
  private done = 0;

  constructor(
    private lessonId: number,
    private file: File,
    private onProgress: (fraction: number) => void,
  ) {}

  /** Local chunked uploads can pause/resume; Blob uploads can only cancel. */
  get resumable() {
    return this.init?.mode !== 'blob';
  }

  get mode() {
    return this.init?.mode ?? null;
  }

  pause() {
    this.paused = true;
    this.xhr?.abort();
  }

  cancel() {
    this.pause();
    this.blobAbort?.abort();
  }

  /** Starts, or resumes after pause()/a network error. */
  async run(): Promise<LessonVideo> {
    this.paused = false;
    if (!this.init) {
      this.init = await api<Init>(`/lessons/${this.lessonId}/video/uploads`, {
        method: 'POST',
        body: JSON.stringify({
          size: this.file.size,
          mime: videoMime(this.file),
          name: this.file.name,
        }),
      });
    }
    return this.init.mode === 'blob' ? this.runBlob(this.init) : this.runChunked(this.init);
  }

  private async runChunked(init: Extract<Init, { mode: 'chunked' }>): Promise<LessonVideo> {
    const status = await api<{ received: number[] }>(`/videos/uploads/${init.uploadId}`);
    const received = new Set(status.received);
    const sizeOf = (i: number) =>
      Math.min(init.chunkSize, this.file.size - i * init.chunkSize);
    this.done = [...received].reduce((sum, i) => sum + sizeOf(i), 0);
    this.onProgress(this.done / this.file.size);

    for (let i = 0; i < init.totalChunks; i++) {
      if (received.has(i)) continue;
      const blob = this.file.slice(i * init.chunkSize, i * init.chunkSize + sizeOf(i));
      await this.putWithRetry(init.uploadId, i, blob);
      this.done += blob.size;
      this.onProgress(this.done / this.file.size);
    }
    return api<LessonVideo>(`/videos/uploads/${init.uploadId}/complete`, { method: 'POST' });
  }

  private async putWithRetry(uploadId: string, index: number, blob: Blob) {
    for (let attempt = 0; ; attempt++) {
      if (this.paused) throw new UploadPaused();
      try {
        await this.put(uploadId, index, blob);
        return;
      } catch (err) {
        if (this.paused) throw new UploadPaused();
        if (attempt >= 3 || /API 4\d\d/.test(String((err as Error).message))) throw err;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }

  private async put(uploadId: string, index: number, blob: Blob) {
    const t = await token();
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.xhr = xhr;
      xhr.open('PUT', `${API_URL}/videos/uploads/${uploadId}/chunks/${index}`);
      if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) this.onProgress((this.done + e.loaded) / this.file.size);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`API ${xhr.status} chunk ${index}: ${xhr.responseText}`));
      xhr.onerror = () => reject(new Error('Failed to fetch'));
      xhr.onabort = () => reject(new UploadPaused());
      xhr.send(blob);
    });
    this.xhr = null;
  }

  private async runBlob(init: Extract<Init, { mode: 'blob' }>): Promise<LessonVideo> {
    const { upload } = await import('@vercel/blob/client');
    const t = await token();
    this.blobAbort = new AbortController();
    const blob = await upload(init.pathname, this.file, {
      access: 'public',
      handleUploadUrl: `${API_URL}${init.handleUploadUrl}`,
      headers: t ? { Authorization: `Bearer ${t}` } : undefined,
      contentType: videoMime(this.file),
      multipart: this.file.size > 100 * 1024 * 1024,
      abortSignal: this.blobAbort.signal,
      onUploadProgress: ({ percentage }) => this.onProgress(percentage / 100),
    });
    return api<LessonVideo>(`/lessons/${this.lessonId}/video/complete`, {
      method: 'POST',
      body: JSON.stringify({ url: blob.url }),
    });
  }
}
