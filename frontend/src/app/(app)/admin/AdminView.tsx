'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CreditCard, GraduationCap, Search, Users } from 'lucide-react';
import { clientApi } from '../../../lib/api/client';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage, useFormat, useLabels } from '../../../i18n/format';
import type {
  AdminCourse,
  AdminPayment,
  AdminStats,
  AdminUser,
  Paginated,
  Role,
  SessionUser,
} from '../../../lib/types';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StatCard,
  Tabs,
  useToast,
  ScrollArea,
} from '../../../components/ui';
import { Forbidden, NetworkError, NoResults } from '../../../components/states';
import { LinkButton } from '../../../components/states/LinkButton';
import ui from '../../../components/teacher/shared.module.scss';
import styles from './admin.module.scss';

type Tab = 'users' | 'courses' | 'payments';

const ROLES: Role[] = ['STUDENT', 'TEACHER', 'ADMIN'];

export function AdminView() {
  const { data: session } = useSession();
  const user = session?.user as SessionUser | undefined;
  const t = useTranslations('admin');
  const f = useFormat();
  const [tab, setTab] = useState<Tab>('users');

  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => clientApi<AdminStats>('/admin/stats'),
    enabled: user?.role === 'ADMIN',
  });

  if (!user) return null;
  if (user.role !== 'ADMIN') {
    return (
      <div className="container">
        <Forbidden text={t('forbidden')} />
      </div>
    );
  }

  return (
    <div className="container">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <section aria-label={t('statsAria')} className={ui.stats}>
        {isLoading || !stats ? (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={86} radius="var(--radius-lg)" />
          ))
        ) : (
          <>
            <StatCard
              icon={<Users size={22} />}
              value={f.number(stats.users)}
              label={t('stats.users', { students: stats.students, admins: stats.admins })}
            />
            <StatCard
              icon={<GraduationCap size={22} />}
              value={stats.teachers}
              label={t('stats.teachers')}
              tone="success"
            />
            <StatCard
              icon={<BookOpen size={22} />}
              value={stats.courses}
              label={t('stats.courses', { count: stats.courses - stats.publishedCourses })}
            />
            <StatCard
              icon={<CreditCard size={22} />}
              value={money(stats.paymentsMonthSum, f)}
              label={t('stats.payments', { count: stats.paymentsMonthCount })}
              tone="warning"
            />
          </>
        )}
      </section>

      <Tabs<Tab>
        label={t('tabsAria')}
        value={tab}
        onChange={setTab}
        items={[
          { value: 'users', label: t('tabs.users') },
          { value: 'courses', label: t('tabs.courses') },
          { value: 'payments', label: t('tabs.payments') },
        ]}
      />

      {tab === 'users' && (
        <div className={ui.twoCol}>
          <div className={ui.main}>
            <UsersTable currentUserId={user.id} />
          </div>
          <aside className={ui.aside}>
            <PaymentsList limit={8} compact onShowAll={() => setTab('payments')} />
          </aside>
        </div>
      )}
      {tab === 'courses' && <CoursesTable />}
      {tab === 'payments' && <PaymentsList limit={50} />}
    </div>
  );
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function UsersTable({ currentUserId }: { currentUserId: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('admin.users');
  const errorText = useApiErrorMessage();
  const f = useFormat();
  const labels = useLabels();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [page, setPage] = useState(1);
  const [blockTarget, setBlockTarget] = useState<AdminUser | null>(null);
  const q = useDebounced(search.trim());

  useEffect(() => setPage(1), [q, role]);

  const params = new URLSearchParams({ page: String(page) });
  if (q) params.set('search', q);
  if (role) params.set('role', role);
  const { data, isLoading, isError, refetch } = useQuery<Paginated<AdminUser>>({
    queryKey: ['admin', 'users', q, role, page],
    queryFn: () => clientApi<Paginated<AdminUser>>(`/admin/users?${params.toString()}`),
    placeholderData: (prev) => prev,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: { role?: Role; blocked?: boolean; emailVerified?: true };
    }) =>
      clientApi<AdminUser>(`/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: (_u, { body }) => {
      setBlockTarget(null);
      toast(
        body.role
          ? t('roleChanged', { role: labels.role(body.role) })
          : body.emailVerified
            ? t('emailConfirmed')
            : body.blocked
            ? t('blocked')
            : t('unblocked'),
      );
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast(errorText(e), 'error'),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className={ui.card} aria-label={t('aria')}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{t('search')}</span>
          <Input
            type="search"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className={styles.filter}>
          <span className={styles.filterLabel}>{t('role')}</span>
          <Select value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
            <option value="">{t('all')}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {labels.role(r)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {isError ? (
        <NetworkError onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className={ui.cardPad}>
          <Skeleton height={280} />
        </div>
      ) : data.items.length === 0 ? (
        <NoResults
          query={q || undefined}
          onReset={() => {
            setSearch('');
            setRole('');
          }}
        />
      ) : (
        <ScrollArea className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">{t('table.user')}</th>
                <th scope="col">{t('table.role')}</th>
                <th scope="col">{t('table.email')}</th>
                <th scope="col">{t('table.registered')}</th>
                <th scope="col">
                  <span className="sr-only">{t('table.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => {
                const name = u.name || u.email;
                const self = u.id === currentUserId;
                return (
                  <tr key={u.id} className={u.blocked ? styles.blockedRow : undefined}>
                    <td>
                      <div className={ui.person}>
                        <Avatar name={name} size={36} />
                        <div className={ui.personText}>
                          <span className={ui.personName}>
                            {name}
                            {self && <span className={styles.you}>{t('you')}</span>}
                          </span>
                          <span className={ui.personSub}>{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <label>
                        <span className="sr-only">{t('roleOf', { name })}</span>
                        <Select
                          className={styles.roleSelect}
                          value={u.role}
                          disabled={self || update.isPending}
                          onChange={(e) =>
                            update.mutate({ id: u.id, body: { role: e.target.value as Role } })
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {labels.role(r)}
                            </option>
                          ))}
                        </Select>
                      </label>
                    </td>
                    <td>
                      <div className={styles.badges}>
                        {u.emailVerified ? (
                          <Badge tone="success">{t('verified')}</Badge>
                        ) : (
                          <Badge tone="warning">{t('notVerified')}</Badge>
                        )}
                        {u.blocked && <Badge tone="danger">{t('blockedBadge')}</Badge>}
                      </div>
                    </td>
                    <td className={styles.dateCell}>{f.date(u.createdAt)}</td>
                    <td>
                      <div className={ui.rowActions}>
                        {!u.emailVerified && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={update.isPending}
                            aria-label={t('confirmEmailOf', { name })}
                            onClick={() => update.mutate({ id: u.id, body: { emailVerified: true } })}
                          >
                            {t('confirmEmail')}
                          </Button>
                        )}
                        <Button
                          variant={u.blocked ? 'outline' : 'ghost'}
                          size="sm"
                          disabled={self}
                          onClick={() =>
                            u.blocked
                              ? update.mutate({ id: u.id, body: { blocked: false } })
                              : setBlockTarget(u)
                          }
                        >
                          {u.blocked ? t('unblock') : t('block')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {data && data.total > data.pageSize && (
        <nav aria-label={t('pagesAria')} className={styles.pager}>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('prev')}
          </Button>
          <span className={ui.muted}>
            {t('pageInfo', { page, pages: totalPages, count: data.total })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('next')}
          </Button>
        </nav>
      )}

      <ConfirmDialog
        open={!!blockTarget}
        title={t('confirmTitle')}
        description={
          blockTarget
            ? t('confirmText', { name: blockTarget.name || blockTarget.email })
            : ''
        }
        confirmLabel={t('confirmBlock')}
        danger
        loading={update.isPending}
        onConfirm={() =>
          blockTarget && update.mutate({ id: blockTarget.id, body: { blocked: true } })
        }
        onCancel={() => setBlockTarget(null)}
      />
    </section>
  );
}

function PaymentsList({
  limit,
  compact = false,
  onShowAll,
}: {
  limit: number;
  compact?: boolean;
  onShowAll?: () => void;
}) {
  const t = useTranslations('admin.payments');
  const f = useFormat();
  const { data, isLoading, isError, refetch } = useQuery<AdminPayment[]>({
    queryKey: ['admin', 'payments', limit],
    queryFn: () => clientApi<AdminPayment[]>(`/admin/payments?limit=${limit}`),
  });

  return (
    <section className={ui.card} aria-label={t('aria')}>
      <div className={`${ui.sectionHead} ${ui.cardPad}`}>
        <h2 className={compact ? ui.h3 : ui.h2}>
          {compact ? t('recent') : t('title')}
        </h2>
        {onShowAll && (
          <Button variant="ghost" size="sm" onClick={onShowAll}>
            {t('all')}
          </Button>
        )}
      </div>
      {isError ? (
        <NetworkError onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className={ui.cardPad}>
          <Skeleton height={160} />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={<CreditCard size={36} />} title={t('empty')} />
      ) : compact ? (
        <ul className={`${ui.list} ${styles.plain}`}>
          {data.map((p) => (
            <li key={p.id} className={ui.listItem}>
              <div className={`${ui.personText} ${ui.grow}`}>
                <span className={ui.personName}>{p.course.title}</span>
                <span className={ui.personSub}>
                  {p.user.name || p.user.email} · {f.relative(p.createdAt)}
                </span>
              </div>
              <span className={styles.sum}>{money(p.amount, f)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ScrollArea className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">{t('table.date')}</th>
                <th scope="col">{t('table.course')}</th>
                <th scope="col">{t('table.buyer')}</th>
                <th scope="col">{t('table.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td className={styles.nowrap}>{f.date(p.createdAt)}</td>
                  <td>{p.course.title}</td>
                  <td>
                    <div className={ui.personText}>
                      <span className={ui.personName}>{p.user.name || p.user.email}</span>
                      {p.user.name && <span className={ui.personSub}>{p.user.email}</span>}
                    </div>
                  </td>
                  <td className={styles.sum}>{money(p.amount, f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </section>
  );
}

function CoursesTable() {
  const t = useTranslations('admin.courses');
  const f = useFormat();
  const { data, isLoading, isError, refetch } = useQuery<AdminCourse[]>({
    queryKey: ['admin', 'courses'],
    queryFn: () => clientApi<AdminCourse[]>('/admin/courses'),
  });

  if (isError) return <NetworkError onRetry={() => refetch()} />;
  if (isLoading || !data) return <Skeleton height={280} radius="var(--radius-lg)" />;
  if (data.length === 0) {
    return (
      <div className={ui.card}>
        <EmptyState icon={<BookOpen size={40} />} title={t('empty')} />
      </div>
    );
  }

  return (
    <section className={ui.card} aria-label={t('aria')}>
      <ScrollArea className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th scope="col">{t('table.course')}</th>
              <th scope="col">{t('table.teacher')}</th>
              <th scope="col">{t('table.price')}</th>
              <th scope="col">{t('table.students')}</th>
              <th scope="col">{t('table.status')}</th>
              <th scope="col">{t('table.created')}</th>
              <th scope="col">
                <span className="sr-only">{t('table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td className={ui.personName}>{c.title}</td>
                <td>{c.teacher.name}</td>
                <td className={styles.nowrap}>{f.price(c.price)}</td>
                <td>{c.studentsCount}</td>
                <td>
                  {c.published ? (
                    <Badge tone="success">{t('published')}</Badge>
                  ) : (
                    <Badge>{t('draft')}</Badge>
                  )}
                </td>
                <td className={styles.nowrap}>{f.date(c.createdAt)}</td>
                <td>
                  <div className={ui.rowActions}>
                    <LinkButton href={`/courses/${c.id}/manage`} variant="outline" size="sm">
                      {t('manage')}
                    </LinkButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </section>
  );
}

/** Money amount; unlike a course price, zero is shown as an amount, not «free». */
function money(amount: number, f: ReturnType<typeof useFormat>): string {
  if (amount > 0) return f.price(amount);
  return f.locale === 'en' ? '₴0' : '0 ₴';
}
