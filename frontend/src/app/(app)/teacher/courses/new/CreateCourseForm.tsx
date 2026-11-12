"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { clientApi } from "../../../../../lib/api/client";
import { useTranslations } from "next-intl";
import { displayName } from "../../../../../lib/format";
import {
  useApiErrorMessage,
  useFormat,
  useLabels,
} from "../../../../../i18n/format";
import type { CourseListItem, Me } from "../../../../../lib/types";
import { Button, PageHeader, useToast } from "../../../../../components/ui";
import {
  BasicFields,
  CardPreview,
  CoverPriceFields,
  useCategoryLabel,
} from "../../../../../components/teacher/course-form/CourseFields";
import {
  EMPTY_COURSE_FORM,
  priceOf,
  toFormData,
  validateCourse,
  type CourseFormState,
} from "../../../../../components/teacher/course-form/courseForm";
import styles from "./create-course.module.scss";

const STEPS = ["basic", "cover", "publish"] as const;

export function CreateCourseForm() {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("teacher.create");
  const tf = useTranslations("teacher.courseForm");
  const errorText = useApiErrorMessage();
  const f = useFormat();
  const labels = useLabels();
  const categoryLabel = useCategoryLabel();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => clientApi<Me>("/users/me"),
  });
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CourseFormState>(EMPTY_COURSE_FORM);
  const [showErrors, setShowErrors] = useState(false);

  // Release the object URL of a picked cover when leaving the page.
  useEffect(
    () => () => {
      if (form.image && form.imagePreview)
        URL.revokeObjectURL(form.imagePreview);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const teacherName = displayName(me?.profile, session?.user?.email ?? "");
  const stepErrors = validateCourse(
    form,
    step === 0 ? "basic" : step === 1 ? "pricing" : "all",
  );

  const create = useMutation({
    mutationFn: (publish: boolean) =>
      clientApi<CourseListItem>("/courses", {
        method: "POST",
        body: toFormData(form, { published: String(publish) }),
      }),
    onSuccess: (course, publish) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(publish ? t("published") : t("draftCreated"));
      router.push(`/teacher/courses/${course.id}/builder`);
    },
    onError: (e) => toast(errorText(e, t("failed")), "error"),
  });

  function next() {
    if (Object.keys(stepErrors).length) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  return (
    <div className="container">
      <PageHeader
        eyebrow={
          <span>
            <Link href="/">{t("breadcrumbCourses")}</Link> /{" "}
            {t("breadcrumbNew")}
          </span>
        }
        title={t("title")}
      />

      <ol className={styles.stepper} aria-label={t("stepsAria")}>
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`${styles.step} ${i === step ? styles.stepActive : ""} ${i < step ? styles.stepDone : ""}`}
            aria-current={i === step ? "step" : undefined}
          >
            <span className={styles.stepNum}>
              {i < step ? <Check size={16} aria-hidden="true" /> : i + 1}
            </span>
            {t(`steps.${label}`)}
          </li>
        ))}
      </ol>

      <div className={styles.layout}>
        <section className={styles.formCard} aria-labelledby="step-title">
          <h2 id="step-title" className={styles.stepTitle}>
            {step + 1}. {t(`steps.${STEPS[step]}`)}
          </h2>

          {step === 0 && (
            <BasicFields
              form={form}
              setForm={setForm}
              errors={showErrors ? stepErrors : {}}
            />
          )}
          {step === 1 && (
            <CoverPriceFields
              form={form}
              setForm={setForm}
              errors={showErrors ? stepErrors : {}}
            />
          )}
          {step === 2 && (
            <>
              <dl className={styles.summary}>
                <div>
                  <dt>{t("summary.title")}</dt>
                  <dd>{form.title}</dd>
                </div>
                <div>
                  <dt>{t("summary.categoryLevel")}</dt>
                  <dd>
                    {[
                      form.category && categoryLabel(form.category),
                      form.level && labels.level(form.level),
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("summary.notSpecified")}
                  </dd>
                </div>
                <div>
                  <dt>{t("summary.price")}</dt>
                  <dd>{f.price(priceOf(form))}</dd>
                </div>
                <div>
                  <dt>{t("summary.enrollment")}</dt>
                  <dd>
                    {form.paid
                      ? t("summary.afterPayment")
                      : form.autoApprove
                        ? tf("autoApprove")
                        : tf("manualApprove")}
                  </dd>
                </div>
              </dl>
              <p className={styles.summaryNote}>{t("summary.note")}</p>
            </>
          )}

          <div className={styles.footer}>
            <Button
              variant="outline"
              onClick={() =>
                step === 0 ? router.push("/") : setStep(step - 1)
              }
            >
              {step === 0 ? t("cancel") : t("back")}
            </Button>
            <span className={styles.stepInfo}>
              {t("stepInfo", { current: step + 1, total: STEPS.length })}
            </span>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>{t("next")}</Button>
            ) : (
              <div className={styles.finalActions}>
                <Button
                  variant="outline"
                  loading={create.isPending && create.variables === false}
                  disabled={create.isPending}
                  onClick={() => create.mutate(false)}
                >
                  {t("saveDraft")}
                </Button>
                <Button
                  loading={create.isPending && create.variables === true}
                  disabled={create.isPending}
                  onClick={() => create.mutate(true)}
                >
                  {t("createPublish")}
                </Button>
              </div>
            )}
          </div>
        </section>

        <aside className={styles.previewCol}>
          <CardPreview form={form} teacherName={teacherName} />
          <p className={styles.previewNote}>{t("previewNote")}</p>
        </aside>
      </div>
    </div>
  );
}
