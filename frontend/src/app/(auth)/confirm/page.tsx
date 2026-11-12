import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ConfirmView } from './ConfirmView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return { title: t('confirm') };
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmView />
    </Suspense>
  );
}
