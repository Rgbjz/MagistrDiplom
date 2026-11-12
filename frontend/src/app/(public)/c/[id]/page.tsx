import { Lock, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { serverApi } from '../../../lib/api/server';
import type { PublicCourse } from '../../../lib/types';
import { LandingCTA } from '../../../components/store/LandingCTA';
import styles from './landing.module.scss';

export default async function CourseLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const courseId = Number(id);
  let course: PublicCourse;
  try {
    course = await serverApi<PublicCourse>(`/public/courses/${courseId}`);
  } catch {
    return (
      <div className={styles.container}>
        <p>Course not found.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <span>Learning Platform</span>
        <Link href="/login" style={{ color: 'inherit', fontSize: 14 }}>
          Log in
        </Link>
      </div>
      <div className={styles.container}>
        <div className={styles.hero}>
          <div>
            <span className={styles.category}>Course</span>
            <h1 className={styles.title}>{course.title}</h1>
            <p className={styles.lead}>{course.description}</p>
            <div className={styles.teacher}>
              <GraduationCap size={16} /> Instructor: <b>{course.teacher.name}</b>
            </div>
          </div>
          <div className={styles.priceCard}>
            <div className={styles.cover} />
            <div className={styles.priceBody}>
              <div className={styles.price}>
                {course.price > 0 ? `$ ${course.price}` : 'Free'}
              </div>
              <div className={styles.priceNote}>
                {course.price > 0 ? 'one-time · full access' : 'request to enroll'}
              </div>
              <LandingCTA courseId={course.id} price={course.price} />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>About</h2>
          <p className={styles.lead}>{course.description}</p>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Program</h2>
          {course.sections.map((s, i) => (
            <div key={i} className={styles.program} style={{ marginBottom: 12 }}>
              <div className={styles.progHead}>
                <span>{s.title}</span>
                <span style={{ opacity: 0.6 }}>{s.lessons.length} lessons</span>
              </div>
              {s.lessons.map((l, j) => (
                <div key={j} className={styles.progItem}>
                  <Lock size={14} /> {l.title}
                  {l.hasTest && ' · 📝 test'}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
