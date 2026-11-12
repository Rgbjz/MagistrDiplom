import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ManagementView } from './ManagementView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('manage');
  return { title: t('meta.title') };
}

export default function ManagePage() {
  return (
    <Suspense>
      <ManagementView />
    </Suspense>
  );
}
