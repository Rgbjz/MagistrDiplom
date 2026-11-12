'use client';

import { getSession } from 'next-auth/react';
import { API_URL } from '../env';

/**
 * Multipart upload with progress (fetch has no upload progress events).
 * Rejects with the same "API <status> <path>: <body>" message as clientApi,
 * so apiErrorMessage() works on it.
 */
export async function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  const session = await getSession();
  const token = session?.accessToken;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve((xhr.responseText ? JSON.parse(xhr.responseText) : undefined) as T);
      } else {
        reject(new Error(`API ${xhr.status} ${path}: ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Failed to fetch'));
    xhr.send(form);
  });
}
