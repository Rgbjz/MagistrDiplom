import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { MyCoursesView } from './MyCoursesView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return { title: t('myCourses.title') };
}

export default function MyCoursesPage() {
  return (
    <Suspense>
      <MyCoursesView />
    </Suspense>
  );
}
