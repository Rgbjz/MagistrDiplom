"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, GraduationCap, PencilLine } from "lucide-react";
import { clientApi } from "../../../../../lib/api/client";
import { useTranslations } from "next-intl";
import { useFormat } from "../../../../../i18n/format";
import type {
  GradebookCell,
  GradebookColumn,
  MyGrades,
} from "../../../../../lib/types";
import {
  Badge,
  EmptyState,
  PageHeader,
  Progress,
  Skeleton,
} from "../../../../../components/ui";
import { Forbidden, QueryError } from "../../../../../components/states";
import {
  fmt,
  groupBySection,
  pct,
} from "../../../../../components/gradebook/grades";
import { useScaleLabel } from "../../../../../components/gradebook/scale";
import styles from "./grades.module.scss";

export default function MyGradesPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const t = useTranslations("grades");
  const f = useFormat();
  const scaleLabel = useScaleLabel();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-grades", id],
    queryFn: () => clientApi<MyGrades>(`/courses/${id}/my-grades`),
  });

  if (isLoading) {
    return (
      <div className="container">
        <Skeleton height={320} radius="var(--radius-lg)" />
      </div>
    );
  }
  if (isError || !data) {
    const forbidden = String((error as Error | null)?.message).includes("403");
    return (
      <div className="container">
        {forbidden ? (
          <Forbidden title={t("forbidden")} />
        ) : (
          <QueryError error={error} onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const { course, columns, row } = data;

  /** "85%" for tests, "40/50" for assignments, a short status word otherwise. */
  function cellLabel(
    column: GradebookColumn,
    cell: GradebookCell | undefined,
  ): string {
    if (!cell) return "—";
    if (cell.state === "graded" && cell.value !== null) {
      return column.kind === "test"
        ? `${fmt(cell.value)}%`
        : `${fmt(cell.value)}/${column.max}`;
    }
    if (
      cell.state === "submitted" ||
      cell.state === "returned" ||
      cell.state === "late"
    ) {
      return t(`cell.${cell.state}`);
    }
    return "—";
  }
  const groups = groupBySection(columns);

  return (
    <div className="container">
      <Link href={`/courses/${id}`} className={styles.back}>
        <ChevronLeft size={18} aria-hidden="true" /> {t("back")}
      </Link>
      <PageHeader
        eyebrow={course.title}
        title={t("title")}
        subtitle={t("subtitle", {
          tests: course.testsWeight,
          assignments: course.assignmentsWeight,
          threshold: course.gradePassThreshold,
        })}
      />

      {!row ? (
        <EmptyState
          icon={<GraduationCap size={28} aria-hidden="true" />}
          title={t("empty")}
        />
      ) : (
        <>
          <section className={styles.summary} aria-label={t("summary")}>
            <div className={styles.final}>
              <span className={styles.finalLabel}>{t("final")}</span>
              <span className={styles.finalValue}>{pct(row.final)}</span>
              {row.scaleGrade && course.gradingScale !== "PERCENT" && (
                <span className={styles.scaleGrade}>
                  {t("scaleGrade")}:{" "}
                  <strong>
                    {scaleLabel(course.gradingScale, row.scaleGrade.code)}
                  </strong>
                </span>
              )}
              {row.final !== null &&
                (row.passed ? (
                  <Badge tone="success">{t("passed")}</Badge>
                ) : (
                  <Badge tone="warning">{t("notPassed")}</Badge>
                ))}
            </div>
            <dl className={styles.parts}>
              <div>
                <dt>{t("tests")}</dt>
                <dd>{pct(row.testsAvg)}</dd>
              </div>
              <div>
                <dt>{t("assignments")}</dt>
                <dd>{pct(row.assignmentsAvg)}</dd>
              </div>
              <div>
                <dt>{t("progress")}</dt>
                <dd>
                  <Progress
                    value={row.progress}
                    showValue
                    label={t("progress")}
                  />
                </dd>
              </div>
            </dl>
            {row.finalOverridden && (
              <p className={styles.overrideNote} role="note">
                <PencilLine size={14} aria-hidden="true" />{" "}
                {t("overriddenReason", { reason: row.finalOverridden.reason })}
                {row.finalOverridden.original !== null && (
                  <>
                    {" "}
                    ·{" "}
                    {t("wasValue", {
                      value: pct(row.finalOverridden.original),
                    })}
                  </>
                )}
              </p>
            )}
          </section>

          {columns.length === 0 ? (
            <EmptyState title={t("noItems")} />
          ) : (
            groups.map((g, gi) => (
              <section key={`${g.title}-${gi}`} className={styles.group}>
                <h2 className={styles.groupTitle}>{g.title}</h2>
                <ul className={styles.list}>
                  {g.columns.map((c) => {
                    const cell = row.cells[c.key];
                    const href =
                      c.kind === "test"
                        ? `/courses/${id}?test=${c.id}`
                        : `/courses/${id}?assignment=${c.id}`;
                    return (
                      <li key={c.key} className={styles.item}>
                        <span className={styles.kind}>
                          {c.kind === "test"
                            ? t("kindTest")
                            : t("kindAssignment")}
                        </span>
                        <Link href={href} className={styles.itemTitle}>
                          {c.title}
                        </Link>
                        {c.dueAt && (
                          <span className={styles.due}>
                            {t("due", { date: f.date(c.dueAt) })}
                          </span>
                        )}
                        <span
                          className={`${styles.cell} ${styles[cell.state]}`}
                        >
                          {cellLabel(c, cell)}
                          <span className="sr-only">
                            {" "}
                            — {t(`state.${cell.state}`)}
                            {cell.late ? t("lateSuffix") : ""}
                          </span>
                        </span>
                        {cell.overridden && (
                          <span className={styles.overrideNote}>
                            <PencilLine size={14} aria-hidden="true" />{" "}
                            {t("overriddenReason", {
                              reason: cell.overridden.reason,
                            })}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
          <p className={styles.note}>{t("note")}</p>
        </>
      )}
    </div>
  );
}
