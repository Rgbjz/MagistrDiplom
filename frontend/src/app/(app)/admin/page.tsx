import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AdminView } from './AdminView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return { title: t('meta.title') };
}

export default function AdminPage() {
  return <AdminView />;
}
