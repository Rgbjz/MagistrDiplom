import { Suspense } from 'react';
import { ConfirmView } from './ConfirmView';

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmView />
    </Suspense>
  );
}
