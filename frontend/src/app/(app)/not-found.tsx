import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NotFoundState } from '../../components/states';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('notFoundTitle') };
}

// notFound() inside this group renders within its layout, which already has
// the header, <main> and footer — the root not-found would add them again.
export default function NotFound() {
  return <NotFoundState />;
}
