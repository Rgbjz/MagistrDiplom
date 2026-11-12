import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { Skeleton } from '../../../components/ui';
import { ChatView } from './ChatView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('chat');
  return { title: t('title') };
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="container">
          <Skeleton height={560} radius="var(--radius-lg)" />
        </div>
      }
    >
      <ChatView />
    </Suspense>
  );
}
