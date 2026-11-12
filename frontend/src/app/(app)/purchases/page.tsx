'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Printer, Receipt, ShoppingBag, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientApi } from '../../../lib/api/client';
import { useFormat } from '../../../i18n/format';
import type { Me, Purchase } from '../../../lib/types';
import {
  Badge,
  Button,
  CourseCover,
  EmptyState,
  Modal,
  PageHeader,
  Skeleton,
  StatCard,
  ScrollArea,
} from '../../../components/ui';
import styles from './purchases.module.scss';

export default function PurchasesPage() {
  const t = useTranslations('purchases');
  const f = useFormat();
  const statusLabel = (status: string) => (status === 'PAID' ? t('status.PAID') : status);
  const [receipt, setReceipt] = useState<Purchase | null>(null);
  const { data: purchases, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => clientApi<Purchase[]>('/store/me/purchases'),
  });
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => clientApi<Me>('/users/me'),
  });

  const total = (purchases ?? []).reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="container">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
      />

      {isLoading ? (
        <Skeleton height={240} radius="var(--radius-lg)" />
      ) : !purchases?.length ? (
        <EmptyState icon={<ShoppingBag size={28} />} title={t('empty')}>
          <Link href="/catalog">{t('toCatalog')}</Link>
        </EmptyState>
      ) : (
        <>
          <section aria-label={t('summary')} className={styles.stats}>
            <StatCard icon={<Receipt size={22} />} value={purchases.length} label={t('count')} />
            <StatCard icon={<Wallet size={22} />} value={f.price(total)} label={t('totalPaid')} tone="success" />
          </section>

          <ScrollArea className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">{t('listCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('col.date')}</th>
                  <th scope="col">{t('col.course')}</th>
                  <th scope="col">{t('col.amount')}</th>
                  <th scope="col">{t('col.status')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.nowrap}>{f.date(p.createdAt)}</td>
                    <td>
                      <span className={styles.course}>
                        <span className={styles.thumb}>
                          <CourseCover id={p.course.id} imageUrl={p.course.imageUrl} title={p.course.title} height={40} />
                        </span>
                        <span className={styles.courseTitle}>{p.course.title}</span>
                      </span>
                    </td>
                    <td className={styles.amount}>{f.price(p.amount)}</td>
                    <td>
                      <Badge tone={p.status === 'PAID' ? 'success' : 'neutral'}>
                        {statusLabel(p.status)}
                      </Badge>
                    </td>
                    <td>
                      <span className={styles.actions}>
                        <Link href={`/courses/${p.course.id}`} className={styles.link}>
                          {t('openCourse')}
                        </Link>
                        <button type="button" className={styles.linkBtn} onClick={() => setReceipt(p)}>
                          {t('receipt')}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </>
      )}

      <Modal
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title={t('receipt')}
        footer={
          <>
            <Button variant="outline" onClick={() => setReceipt(null)}>
              {t('close')}
            </Button>
            <Button onClick={() => window.print()}>
              <Printer size={16} aria-hidden="true" /> {t('print')}
            </Button>
          </>
        }
      >
        {receipt && (
          <div className={`${styles.receiptPrint} print-only-receipt`}>
            <dl className={styles.receipt}>
              <div>
                <dt>{t('receiptFields.number')}</dt>
                <dd>LMS-{String(receipt.id).padStart(6, '0')}</dd>
              </div>
              <div>
                <dt>{t('receiptFields.date')}</dt>
                <dd>{f.date(receipt.createdAt)}</dd>
              </div>
              {me && (
                <div>
                  <dt>{t('receiptFields.buyer')}</dt>
                  <dd>{me.email}</dd>
                </div>
              )}
              <div>
                <dt>{t('receiptFields.course')}</dt>
                <dd>{receipt.course.title}</dd>
              </div>
              <div>
                <dt>{t('receiptFields.status')}</dt>
                <dd>{statusLabel(receipt.status)}</dd>
              </div>
              <div className={styles.receiptTotal}>
                <dt>{t('receiptFields.amount')}</dt>
                <dd>{f.price(receipt.amount)}</dd>
              </div>
            </dl>
            <p className={styles.receiptNote}>{t('receiptNote')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
