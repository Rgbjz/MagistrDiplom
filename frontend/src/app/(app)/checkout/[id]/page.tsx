'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { clientApi } from '../../../../lib/api/client';
import { Button, Card, Input, useToast } from '../../../../components/ui';
import type { PublicCourse } from '../../../../lib/types';
import styles from './checkout.module.scss';

export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const toast = useToast();
  const [card, setCard] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: course } = useQuery<PublicCourse>({
    queryKey: ['public-course', id],
    queryFn: () => clientApi<PublicCourse>(`/public/courses/${id}`),
  });

  async function pay() {
    setBusy(true);
    try {
      await clientApi(`/courses/${id}/purchase`, { method: 'POST' });
      toast('Payment successful 🎉', 'success');
      router.push(`/courses/${id}`);
    } catch {
      toast('Payment failed', 'error');
      setBusy(false);
    }
  }

  if (!course) return <p>Loading…</p>;

  return (
    <div className={styles.page}>
      <h1>Checkout</h1>
      <Card className={styles.card}>
        <div className={styles.row}>
          <span>{course.title}</span>
          <span className={styles.total}>${course.price}</span>
        </div>
        <div className={styles.field}>
          <label>Card number (any value — mock)</label>
          <Input
            value={card}
            onChange={(e) => setCard(e.target.value)}
            placeholder="4242 4242 4242 4242"
          />
        </div>
        <div className={styles.split}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label>Expiry</label>
            <Input
              value={exp}
              onChange={(e) => setExp(e.target.value)}
              placeholder="12/29"
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <label>CVC</label>
            <Input
              value={cvc}
              onChange={(e) => setCvc(e.target.value)}
              placeholder="123"
            />
          </div>
        </div>
        <Button variant="primary" onClick={pay} loading={busy}>
          Pay ${course.price}
        </Button>
        <p className={styles.note}>Mock payment — no real charge.</p>
      </Card>
    </div>
  );
}
