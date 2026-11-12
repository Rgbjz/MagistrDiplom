import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { NotFoundState } from '../components/states';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('notFoundTitle') };
}

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main id="main" style={{ flex: 1, display: 'flex' }}>
        <NotFoundState />
      </main>
      <Footer />
    </div>
  );
}
