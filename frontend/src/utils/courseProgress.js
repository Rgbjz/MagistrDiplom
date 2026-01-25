export function calculateProgress (sections, progress) {
  if (!sections?.length) return 0

  let total = 0
  let completed = 0

  sections.forEach(section => {
    section.lessons?.forEach(lesson => {
      total++

      if (progress?.lessons?.[lesson.id]) {
        completed++
      }

      if (lesson.test) {
        total++
        if (progress?.tests?.[lesson.test.id]) {
          completed++
        }
      }
    })
  })

  return total === 0 ? 0 : Math.round((completed / total) * 100)
}
