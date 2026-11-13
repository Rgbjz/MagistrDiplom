import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BarChart3, ChevronLeft, GraduationCap, Settings } from 'lucide-react';
import type { CourseDetail, SessionUser } from '../../lib/types';
import { CourseChatButton } from './CourseChatButton';
import { OnlineLessonButton } from '../call/OnlineLessonButton';
import { canCourse } from '../../lib/courseRole';
import styles from './CourseTopBar.module.scss';

export function CourseTopBar({ course, user }: { course: CourseDetail; user: SessionUser }) {
  const t = useTranslations('course.topBar');
  // An assistant may have a student account; the team role decides what they see.
  const isTeamMember = canCourse(course.myRole, 'view');
  const isStudent = user.role === 'STUDENT' && !isTeamMember;
  const isOwner = isTeamMember;
  const isTeacher = canCourse(course.myRole, 'content') && course.myRole !== 'ADMIN';
  const percent = course.progress?.percent ?? 0;

  return (
    <div className={styles.bar}>
      <div className={styles.inner}>
        <Link
          href={isStudent ? '/my-courses' : '/'}
          className={styles.back}
          aria-label={isStudent ? t('toMyCoursesLabel') : t('toHome')}
        >
          <ChevronLeft size={20} aria-hidden="true" />
          <span className={styles.backText}>{isStudent ? t('myCourses') : t('toHome')}</span>
        </Link>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.titleBox}>
          <span className={styles.title}>{course.title}</span>
          {isStudent && course.progress && (
            <div className={styles.progressRow}>
              <div
                role="progressbar"
                aria-label={t('progress')}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className={styles.track}
              >
                <div className={styles.fill} style={{ width: `${percent}%` }} />
              </div>
              <span className={styles.percent}>{percent}%</span>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          {isStudent && (
            <Link
              href={`/courses/${course.id}/grades`}
              className={styles.chatBtn}
              aria-label={t('myGrades')}
            >
              <GraduationCap size={18} aria-hidden="true" />
              <span className={styles.backText}>{t('myGrades')}</span>
            </Link>
          )}
          {isOwner && (
            <Link
              href={`/courses/${course.id}/analytics`}
              className={styles.chatBtn}
              aria-label={t('analytics')}
            >
              <BarChart3 size={18} aria-hidden="true" />
              <span className={styles.backText}>{t('analytics')}</span>
            </Link>
          )}
          {isOwner && (
            <Link href={`/courses/${course.id}/manage`} className={styles.chatBtn}>
              <Settings size={18} aria-hidden="true" />
              <span className={styles.backText}>{t('manage')}</span>
            </Link>
          )}
          {isTeacher && (
            <>
              <span className={styles.desktopOnly}>
                <OnlineLessonButton courseId={course.id} courseTitle={course.title} className={styles.chatBtn} />
              </span>
              <span className={styles.mobileOnly}>
                <OnlineLessonButton
                  courseId={course.id}
                  courseTitle={course.title}
                  className={styles.chatBtn}
                  compact
                />
              </span>
            </>
          )}
          <span className={styles.desktopOnly}>
            <CourseChatButton courseId={course.id} />
          </span>
          <span className={styles.mobileOnly}>
            <CourseChatButton courseId={course.id} compact />
          </span>
        </div>
      </div>
    </div>
  );
}
