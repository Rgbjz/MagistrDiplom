'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { clientApi } from '../../../../../lib/api/client';
import type { CourseListItem } from '../../../../../lib/types';
import styles from './create-course.module.scss';

export function CreateCourseForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [price, setPrice] = useState('0');
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const mutation = useMutation({
    mutationFn: (fd: FormData) =>
      clientApi<CourseListItem>('/courses', { method: 'POST', body: fd }),
    onSuccess: (course) => {
      router.push(`/teacher/courses/${course.id}/builder`);
    },
  });

  function submit() {
    if (!title.trim()) return;
    const fd = new FormData();
    fd.append('title', title);
    fd.append('description', description);
    fd.append('price', String(Number(price) || 0));
    if (image) fd.append('image', image);
    mutation.mutate(fd);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1>Create course</h1>
        <div className={styles.field}>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Price ($, 0 = free)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label>Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setImage(file);
              if (preview) URL.revokeObjectURL(preview);
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
          />
        </div>
        <button
          className={styles.button}
          onClick={submit}
          disabled={mutation.isPending || !title.trim()}
        >
          {mutation.isPending ? 'Creating…' : 'Create'}
        </button>
      </div>

      <div className={styles.card}>
        <h3>Preview</h3>
        <div className={styles.previewImage}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" />
          ) : (
            'No image'
          )}
        </div>
        <div className={styles.previewContent}>
          <h3>{title || 'Course title'}</h3>
          <p>{description || 'Course description'}</p>
        </div>
      </div>
    </div>
  );
}
