'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../../lib/api/client';
import { useApiErrorMessage, useFormat } from '../../../../i18n/format';
import type { Me, MyStatus, PublicCourse } from '../../../../lib/types';
import {
  Button,
  CourseCover,
  EmptyState,
  Field,
  Input,
  Skeleton,
  useToast,
} from '../../../../components/ui';
import { track } from '../../../../lib/analytics';
import { NotFoundState, QueryError } from '../../../../components/states';
import styles from './checkout.module.scss';

export default function CheckoutPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  const t = useTranslations('checkout');
  const f = useFormat();
  const errorText = useApiErrorMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [agree, setAgree] = useState(true);
  const [card, setCard] = useState('4242 4242 4242 4242');
  const [exp, setExp] = useState('12/29');
  const [cvc, setCvc] = useState('123');
  const [holder, setHolder] = useState('TEST USER');

  const { data: course, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['public-course', id],
    queryFn: () => clientApi<PublicCourse>(`/store/public/courses/${id}`),
  });
  const { data: status } = useQuery({
    queryKey: ['my-status', id],
    queryFn: () => clientApi<MyStatus>(`/store/courses/${id}/my-status`),
  });
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => clientApi<Me>('/users/me'),
  });

  const pay = useMutation({
    mutationFn: () =>
      clientApi<{ ok: boolean }>(`/store/courses/${id}/purchase`, { method: 'POST' }),
    onSuccess: () => {
      if (course) {
        track('purchase', {
          // The API does not return the payment id; this is unique per checkout.
          transaction_id: `course-${course.id}-${Date.now()}`,
          currency: 'UAH',
          value: course.price,
          items: [{ item_id: String(course.id), item_name: course.title, price: course.price }],
        });
      }
      for (const key of ['purchases', 'my-courses', 'dashboard', 'my-status', 'notifications']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (e) => toast(errorText(e, t('paymentFailed')), 'error'),
  });

  useEffect(() => {
    if (!course || course.price <= 0) return;
    track('begin_checkout', {
      currency: 'UAH',
      value: course.price,
      items: [{ item_id: String(course.id), item_name: course.title, price: course.price }],
    });
  }, [course]);

  const cardValid = card.replace(/\s/g, '').length >= 12 && /^\d{2}\/\d{2}$/.test(exp) && cvc.length >= 3 && holder.trim().length > 1;

  if (isLoading) {
    return (
      <div className="container">
        <Skeleton height={40} width={320} />
        <Skeleton height={420} radius="var(--radius-lg)" />
      </div>
    );
  }
  if (isError || !course) {
    const message = error instanceof Error ? error.message : '';
    return (
      <div className="container">
        {!course && (!isError || /^API 404/.test(message)) ? (
          <NotFoundState title={t('notFound')} />
        ) : (
          <QueryError error={error} onRetry={() => refetch()} />
        )}
      </div>
    );
  }

  const owned = status?.enrollmentStatus === 'ACTIVE' || status?.enrollmentStatus === 'COMPLETED';

  if (pay.isSuccess || owned) {
    return (
      <div className="container">
        <section className={styles.success} aria-live="polite">
          <CheckCircle2 size={40} aria-hidden="true" className={styles.successIcon} />
          <div className={styles.successText}>
            <h1 className={styles.successTitle}>
              {pay.isSuccess ? t('success.paidTitle') : t('success.ownedTitle')}
            </h1>
            <p className={styles.muted}>
              {pay.isSuccess
                ? me
                  ? t('success.receiptSavedFor', { email: me.email })
                  : t('success.receiptSaved')
                : t('success.alreadyOwned', { title: course.title })}
            </p>
          </div>
          <div className={styles.successActions}>
            <Link href={`/courses/${id}`} className={styles.primaryLink}>
              {t('success.toLearning')}
            </Link>
            <Link href="/purchases" className={styles.secondaryLink}>
              {t('success.purchases')}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  if (course.price <= 0) {
    return (
      <div className="container">
        <EmptyState title={t('free.title')}>
          <Link href={`/c/${id}`}>{t('free.enroll')}</Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="container">
      <div className={styles.head}>
        <Link href={`/c/${id}`} className={styles.back}>
          <ArrowLeft size={18} aria-hidden="true" /> {t('backToCourse')}
        </Link>
        <h1 className={styles.title}>{t('title')}</h1>
      </div>

      <div className={styles.note} role="note">
        <ShieldCheck size={18} aria-hidden="true" />
        {t('testNote')}
      </div>

      <div className={styles.layout}>
        <section className={`${styles.card} ${styles.summary}`} aria-labelledby="order-title">
          <h2 id="order-title" className={styles.cardTitle}>
            {t('order.title')}
          </h2>
          <div className={styles.course}>
            <div className={styles.cover}>
              <CourseCover id={course.id} imageUrl={course.imageUrl} title={course.title} height={72} />
            </div>
            <div className={styles.courseText}>
              <span className={styles.courseTitle}>{course.title}</span>
              <span className={styles.muted}>
                {course.teacher.name}
                {course.sectionsCount ? ` · ${t('order.sections', { count: course.sectionsCount })}` : ''}
                {course.lessonsCount ? ` · ${t('order.lessons', { count: course.lessonsCount })}` : ''}
              </span>
            </div>
          </div>
          <dl className={styles.totals}>
            <div>
              <dt>{t('order.price')}</dt>
              <dd>{f.price(course.price)}</dd>
            </div>
            <div className={styles.grand}>
              <dt>{t('order.total')}</dt>
              <dd>{f.price(course.price)}</dd>
            </div>
          </dl>
        </section>

        <form
          className={`${styles.card} ${styles.payment}`}
          aria-labelledby="pay-title"
          onSubmit={(e) => {
            e.preventDefault();
            if (cardValid && agree) pay.mutate();
          }}
        >
          <h2 id="pay-title" className={styles.cardTitle}>
            {t('form.title')}
          </h2>
          <Field label={t('form.cardNumber')}>
            <Input
              value={card}
              onChange={(e) => setCard(e.target.value)}
              inputMode="numeric"
              autoComplete="cc-number"
            />
          </Field>
          <div className={styles.split}>
            <Field label={t('form.expiry')}>
              <Input value={exp} onChange={(e) => setExp(e.target.value)} autoComplete="cc-exp" />
            </Field>
            <Field label={t('form.cvc')}>
              <Input value={cvc} onChange={(e) => setCvc(e.target.value)} inputMode="numeric" autoComplete="cc-csc" />
            </Field>
          </div>
          <Field label={t('form.holder')}>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} autoComplete="cc-name" />
          </Field>
          <label className={styles.check}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.currentTarget.checked)} />
            {t('form.agree')}
          </label>
          <Button type="submit" size="lg" block loading={pay.isPending} disabled={!cardValid || !agree}>
            {t('form.pay', { amount: f.price(course.price) })}
          </Button>
          <p className={styles.secure}>
            <Lock size={14} aria-hidden="true" /> {t('form.secure')}
          </p>
        </form>
      </div>
    </div>
  );
}
