import { TeacherGuard } from '../../../../../components/teacher/TeacherGuard';
import { CreateCourseForm } from './CreateCourseForm';

export default function CreateCoursePage() {
  return (
    <TeacherGuard allowAdmin={false}>
      <CreateCourseForm />
    </TeacherGuard>
  );
}
