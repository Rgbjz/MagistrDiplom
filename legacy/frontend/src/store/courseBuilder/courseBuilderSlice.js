import { createSlice } from '@reduxjs/toolkit'
import {
  fetchCourse,
  createCourse,
  addSection,
  addLesson,
  addTest,
  updateSection,
  updateLesson,
  updateTest,
  deleteSection,
  deleteLesson,
  deleteTest
} from './courseBuilderThunks'
import { updateCourse, deleteCourse } from '../course/courseThunks'

const initialState = {
  course: null,
  sections: [],
  activeItem: null, // { type: 'COURSE' | 'SECTION' | 'LESSON' | 'TEST', id }
  loading: false,
  error: null
}

// ===== helpers =====
const clearActiveIfMatches = (state, type, id) => {
  if (state.activeItem?.type === type && state.activeItem.id === id) {
    state.activeItem = null
  }
}

const slice = createSlice({
  name: 'courseBuilder',
  initialState,
  reducers: {
    setActiveItem (state, action) {
      state.activeItem = action.payload
    },
    resetBuilder () {
      return initialState
    }
  },
  extraReducers: builder => {
    builder
      // ===== fetch course =====
      .addCase(fetchCourse.pending, state => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCourse.fulfilled, (state, action) => {
        state.loading = false
        state.course = action.payload
        state.sections = action.payload.sections ?? []
      })
      .addCase(fetchCourse.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })

      // ===== create section =====
      .addCase(addSection.fulfilled, (state, action) => {
        state.sections.push(action.payload)
      })

      // ===== update section =====
      .addCase(updateSection.fulfilled, (state, action) => {
        const idx = state.sections.findIndex(s => s.id === action.payload.id)
        if (idx !== -1) {
          state.sections[idx] = {
            ...state.sections[idx],
            ...action.payload
          }
        }
      })

      // ===== delete section =====
      .addCase(deleteSection.fulfilled, (state, action) => {
        const sectionId = action.payload

        state.sections = state.sections.filter(s => s.id !== sectionId)
        clearActiveIfMatches(state, 'SECTION', sectionId)
      })

      // ===== create lesson =====
      .addCase(addLesson.fulfilled, (state, action) => {
        const { sectionId, lesson } = action.payload
        const section = state.sections.find(s => s.id === sectionId)

        if (section) {
          section.lessons = section.lessons || []
          section.lessons.push(lesson)
        }
      })

      // ===== update lesson =====
      .addCase(updateLesson.fulfilled, (state, action) => {
        const updated = action.payload

        for (const section of state.sections) {
          const idx = section.lessons?.findIndex(l => l.id === updated.id)
          if (idx !== -1) {
            section.lessons[idx] = {
              ...section.lessons[idx],
              ...updated
            }
            break
          }
        }
      })

      // ===== delete lesson =====
      .addCase(deleteLesson.fulfilled, (state, action) => {
        const lessonId = action.payload

        for (const section of state.sections) {
          section.lessons = section.lessons?.filter(l => l.id !== lessonId)
        }

        clearActiveIfMatches(state, 'LESSON', lessonId)
      })

      // ===== create test (ONE test per lesson) =====
      .addCase(addTest.fulfilled, (state, action) => {
        const { lessonId, test } = action.payload

        for (const section of state.sections) {
          const lesson = section.lessons?.find(l => l.id === lessonId)
          if (lesson) {
            lesson.test = test
            break
          }
        }
      })

      // ===== update test =====
      .addCase(updateTest.fulfilled, (state, action) => {
        const updated = action.payload

        for (const section of state.sections) {
          const lesson = section.lessons?.find(l => l.test?.id === updated.id)
          if (lesson) {
            lesson.test = {
              ...lesson.test,
              ...updated
            }
            break
          }
        }
      })

      // ===== delete test =====
      .addCase(deleteTest.fulfilled, (state, action) => {
        const testId = action.payload

        for (const section of state.sections) {
          const lesson = section.lessons?.find(l => l.test?.id === testId)
          if (lesson) {
            lesson.test = null
            break
          }
        }

        clearActiveIfMatches(state, 'TEST', testId)
      })
      // ===== update course =====
      .addCase(updateCourse.fulfilled, (state, action) => {
        if (state.course?.id === action.payload.id) {
          state.course = {
            ...state.course,
            ...action.payload
          }
        }
      })

      // ===== delete course =====
      .addCase(deleteCourse.fulfilled, () => {
        return initialState
      })
  }
})

export const { setActiveItem, resetBuilder } = slice.actions
export default slice.reducer
