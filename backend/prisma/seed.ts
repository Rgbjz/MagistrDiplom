import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10)

  // Teacher
  const teacher = await prisma.user.create({
    data: {
      email: 'teacher@example.com',
      password: passwordHash,
      role: 'TEACHER',
      emailVerified: true,
      profile: { create: { firstName: 'Tessa', lastName: 'Teacher' } },
    },
  })

  // Students
  const student1 = await prisma.user.create({
    data: {
      email: 'student1@example.com',
      password: passwordHash,
      role: 'STUDENT',
      emailVerified: true,
      profile: { create: { firstName: 'Sam', lastName: 'Student' } },
    },
  })

  const student2 = await prisma.user.create({
    data: {
      email: 'student2@example.com',
      password: passwordHash,
      role: 'STUDENT',
      emailVerified: true,
      profile: { create: { firstName: 'Sara', lastName: 'Scholar' } },
    },
  })

  // Course with section -> lesson -> test -> questions -> answers
  const course = await prisma.course.create({
    data: {
      title: 'Intro to TypeScript',
      description: 'A starter course.',
      teacherId: teacher.id,
      sections: {
        create: {
          title: 'Getting Started',
          order: 1,
          lessons: {
            create: {
              title: 'What is TypeScript?',
              content: 'TypeScript is a typed superset of JavaScript.',
              order: 1,
              test: {
                create: {
                  title: 'Lesson 1 Quiz',
                  timeLimit: 10,
                  passingScore: 60,
                  questions: {
                    create: [
                      {
                        text: 'TypeScript compiles to?',
                        type: 'SINGLE',
                        difficulty: 1,
                        answers: {
                          create: [
                            { text: 'JavaScript', isCorrect: true },
                            { text: 'Python', isCorrect: false },
                            { text: 'WebAssembly', isCorrect: false },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  // Enrollments: student1 ACTIVE, student2 PENDING
  await prisma.enrollment.createMany({
    data: [
      { userId: student1.id, courseId: course.id, status: 'ACTIVE' },
      { userId: student2.id, courseId: course.id, status: 'PENDING' },
    ],
  })

  console.log('Seed complete:', {
    teacher: teacher.email,
    students: [student1.email, student2.email],
    course: course.title,
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
