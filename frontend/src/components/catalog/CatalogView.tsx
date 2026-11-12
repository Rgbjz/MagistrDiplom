'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import type { CourseLevel } from '../../lib/types';
import { useLabels } from '../../i18n/format';
import { Button, EmptyState, PageHeader, Segmented, Select, Skeleton } from '../ui';
import { CatalogCard } from './CatalogCard';
import { fetchCatalog } from './publicApi';
import { track } from '../../lib/analytics';
import styles from './CatalogView.module.scss';
import { useCategoryLabel } from '../../i18n/categories';

const PAGE_SIZE = 12;
const LEVELS: CourseLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const SORTS = ['new', 'popular', 'price_asc', 'price_desc'] as const;
type PriceFilter = '' | 'free' | 'paid';

export function CatalogView() {
  const t = useTranslations('catalog');
  const categoryLabel = useCategoryLabel();
  const labels = useLabels();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const search = params.get('search') ?? '';
  const category = params.get('category') ?? '';
  const level = params.get('level') ?? '';
  const price = (params.get('price') ?? '') as PriceFilter;
  const sort = params.get('sort') ?? 'new';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [searchInput, setSearchInput] = useState(search);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /** Writes filters to the URL; any filter change resets to page 1. */
  function update(patch: Record<string, string | number | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || (k === 'sort' && v === 'new') || (k === 'page' && v === 1)) {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    }
    if (!('page' in patch)) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Debounce typing into the search box.
  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => update({ search: searchInput.trim() }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // `search` in the URL is already debounced; report each settled term once.
  useEffect(() => {
    if (search) track('search', { search_term: search });
  }, [search]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['catalog', { search, category, level, price, sort, page }],
    queryFn: () =>
      fetchCatalog({ search, category, level, price, sort, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.pageSize ?? PAGE_SIZE)));
  const hasFilters = Boolean(search || category || level || price);

  function reset() {
    setSearchInput('');
    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="container">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{t('searchLabel')}</span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('searchPlaceholder')}
          />
          {searchInput && (
            <button
              type="button"
              className={styles.clear}
              aria-label={t('clearSearch')}
              onClick={() => setSearchInput('')}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </label>
        <Button
          variant="outline"
          className={styles.filtersBtn}
          aria-expanded={filtersOpen}
          aria-controls="catalog-filters"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          {t('filters')}
        </Button>
      </div>

      <div className={styles.chips}>
        <Segmented<PriceFilter>
          label={t('price')}
          value={price}
          onChange={(v) => update({ price: v })}
          items={[
            { value: '', label: t('priceAll') },
            { value: 'free', label: t('priceFree') },
            { value: 'paid', label: t('pricePaid') },
          ]}
        />
      </div>

      <div className={styles.layout}>
        <aside
          id="catalog-filters"
          aria-label={t('filters')}
          className={`${styles.filters} ${filtersOpen ? styles.filtersOpen : ''}`}
        >
          <div className={styles.filtersHead}>
            <span className={styles.filtersTitle}>{t('filters')}</span>
            {hasFilters && (
              <button type="button" className={styles.reset} onClick={reset}>
                {t('reset')}
              </button>
            )}
          </div>

          {(data?.categories.length ?? 0) > 0 && (
            <fieldset className={styles.group}>
              <legend>{t('category')}</legend>
              <label className={styles.option}>
                <input
                  type="radio"
                  name="category"
                  checked={!category}
                  onChange={() => update({ category: '' })}
                />
                {t('allCategories')}
              </label>
              {data!.categories.map((c) => (
                <label key={c} className={styles.option}>
                  <input
                    type="radio"
                    name="category"
                    checked={category === c}
                    onChange={() => update({ category: c })}
                  />
                  {categoryLabel(c)}
                </label>
              ))}
            </fieldset>
          )}

          <fieldset className={`${styles.group} ${styles.priceGroup}`}>
            <legend>{t('price')}</legend>
            {(
              [
                ['', t('priceAll')],
                ['free', t('priceFree')],
                ['paid', t('pricePaid')],
              ] as const
            ).map(([v, label]) => (
              <label key={v || 'all'} className={styles.option}>
                <input
                  type="radio"
                  name="price"
                  checked={price === v}
                  onChange={() => update({ price: v })}
                />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>{t('level')}</legend>
            <label className={styles.option}>
              <input
                type="radio"
                name="level"
                checked={!level}
                onChange={() => update({ level: '' })}
              />
              {t('anyLevel')}
            </label>
            {LEVELS.map((l) => (
              <label key={l} className={styles.option}>
                <input
                  type="radio"
                  name="level"
                  checked={level === l}
                  onChange={() => update({ level: l })}
                />
                {labels.level(l)}
              </label>
            ))}
          </fieldset>
        </aside>

        <section className={styles.results} aria-live="polite">
          <div className={styles.resultsHead}>
            <span className={styles.count}>
              {isLoading
                ? t('searching')
                : t.rich('found', { count: total, b: (chunks) => <b>{chunks}</b> })}
            </span>
            <label className={styles.sort}>
              <span className="sr-only">{t('sortLabel')}</span>
              <Select value={sort} onChange={(e) => update({ sort: e.target.value })}>
                {SORTS.map((value) => (
                  <option key={value} value={value}>
                    {t(`sort.${value}`)}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          {isError ? (
            <EmptyState title={t('loadError')}>
              <Button variant="outline" onClick={() => refetch()}>
                {t('retry')}
              </Button>
            </EmptyState>
          ) : isLoading ? (
            <div className={styles.grid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={260} radius="var(--radius-lg)" />
              ))}
            </div>
          ) : total === 0 ? (
            <EmptyState icon={<Search size={28} />} title={t('emptyTitle')}>
              <p className={styles.emptyText}>{t('emptyText')}</p>
              {hasFilters && (
                <Button variant="outline" onClick={reset}>
                  {t('resetFilters')}
                </Button>
              )}
            </EmptyState>
          ) : (
            <div className={styles.grid}>
              {data!.items.map((c) => (
                <CatalogCard key={c.id} course={c} />
              ))}
            </div>
          )}

          {pages > 1 && (
            <nav aria-label={t('pagination')} className={styles.pagination}>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => update({ page: page - 1 })}
                aria-label={t('prevPage')}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.pageBtn} ${p === page ? styles.pageActive : ''}`}
                  aria-current={p === page ? 'page' : undefined}
                  onClick={() => update({ page: p })}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className={styles.pageBtn}
                disabled={page >= pages}
                onClick={() => update({ page: page + 1 })}
                aria-label={t('nextPage')}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
