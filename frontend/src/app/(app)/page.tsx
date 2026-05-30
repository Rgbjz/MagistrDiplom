import { auth } from '../../auth';
import { serverApi } from '../../lib/api/server';
import { CourseCard } from '../../components/CourseCard';
import type { CourseListItem, SessionUser } from '../../lib/types';
import styles from './home.module.scss';

export default async function HomePage() {
  const session = await auth();
  const user = session!.user as SessionUser;
  const courses = await serverApi<CourseListItem[]>('/courses');

  return (
    <div className={styles.page}>
      <h1>Dashboard</h1>
      {courses.length === 0 ? (
        <p>No courses yet.</p>
      ) : (
        <div className={styles.grid}>
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
