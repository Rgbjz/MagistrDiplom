import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TeacherGuard } from '../../../../../components/teacher/TeacherGuard';
import { CreateCourseForm } from './CreateCourseForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('teacher');
  return { title: t('meta.title') };
}

export default function CreateCoursePage() {
  return (
    <TeacherGuard allowAdmin={false}>
      <CreateCourseForm />
    </TeacherGuard>
  );
}
