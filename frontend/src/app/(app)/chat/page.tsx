import { Suspense } from 'react';
import { ChatView } from './ChatView';

export default function ChatPage() {
  return (
    <Suspense fallback={<p>Loading chat…</p>}>
      <ChatView />
    </Suspense>
  );
}
