import { useDispatch, useSelector } from 'react-redux'
import { useEffect, useState } from 'react'
import {
  fetchTest,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createAnswer,
  updateAnswer,
  deleteAnswer
} from '../../../../../store/tests/testThunks'
import { updateTest } from '../../../../../store/courseBuilder/courseBuilderThunks'
import styles from './TestEditor.module.scss'

/* ====================================================== */
/* ===================== TEST EDITOR ==================== */
/* ====================================================== */

export default function TestEditor ({ testId }) {
  const dispatch = useDispatch()
  const { current: test, loading } = useSelector(state => state.test)

  const [title, setTitle] = useState('')
  const [timeLimit, setTimeLimit] = useState(30)
  const [passingScore, setPassingScore] = useState(60)

  /* ===== LOAD TEST ===== */
  useEffect(() => {
    if (testId) dispatch(fetchTest(testId))
  }, [testId, dispatch])

  /* ===== SYNC META ===== */
  useEffect(() => {
    if (test) {
      setTitle(test.title)
      setTimeLimit(test.timeLimit)
      setPassingScore(test.passingScore)
    }
  }, [test])

  if (loading || !test) {
    return <div className={styles.loading}>Загрузка теста...</div>
  }

  /* ===== SAVE META ===== */
  const saveMeta = () => {
    dispatch(
      updateTest({
        id: test.id,
        data: { title, timeLimit, passingScore }
      })
    )
  }

  const addQuestion = () => {
    dispatch(
      createQuestion({
        testId: test.id,
        data: { text: 'Новый вопрос', type: 'SINGLE' }
      })
    )
  }

  return (
    <div className={styles.editor}>
      <h2>🧪 Редактор теста</h2>

      {/* ===== META ===== */}
      <div className={styles.meta}>
        <label>Название</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={saveMeta}
        />

        <div className={styles.row}>
          <div>
            <label>Время (мин)</label>
            <input
              type='number'
              value={timeLimit}
              onChange={e => setTimeLimit(+e.target.value)}
              onBlur={saveMeta}
            />
          </div>

          <div>
            <label>Проходной балл (%)</label>
            <input
              type='number'
              value={passingScore}
              onChange={e => setPassingScore(+e.target.value)}
              onBlur={saveMeta}
            />
          </div>
        </div>
      </div>

      {/* ===== QUESTIONS ===== */}
      <div className={styles.questions}>
        <div className={styles.questionsHeader}>
          <h3>Вопросы</h3>
          <button onClick={addQuestion}>+ Вопрос</button>
        </div>

        {test.questions.map(q => (
          <QuestionItem key={q.id} q={q} dispatch={dispatch} />
        ))}
      </div>
    </div>
  )
}

/* ====================================================== */
/* =================== QUESTION ITEM ==================== */
/* ====================================================== */

function QuestionItem ({ q, dispatch }) {
  const [text, setText] = useState(q.text)
  const [type, setType] = useState(q.type)
  const [answers, setAnswers] = useState(q.answers || [])

  /* ===== SYNC FROM STORE ===== */
  useEffect(() => {
    setText(q.text)
    setType(q.type)
    setAnswers(q.answers || [])
  }, [q])

  /* ===== SAVE QUESTION TEXT ONLY ===== */
  const saveQuestionText = () => {
    if (text !== q.text) {
      dispatch(
        updateQuestion({
          id: q.id,
          data: { text }
        })
      )
    }
  }

  /* ===== CHANGE TYPE (🔥 FIXED) ===== */
  const changeType = newType => {
    if (newType === type) return

    setType(newType)

    // ✅ СРАЗУ сохраняем тип вопроса
    dispatch(
      updateQuestion({
        id: q.id,
        data: { type: newType }
      })
    )

    // ✅ если SINGLE — оставляем только один правильный
    if (newType === 'SINGLE') {
      setAnswers(prev => {
        if (!prev.length) return prev

        const firstCorrect = prev.find(a => a.isCorrect) || prev[0]

        const normalized = prev.map(a => ({
          ...a,
          isCorrect: a.id === firstCorrect.id
        }))

        // ✅ синхронно сохраняем ответы
        normalized.forEach(a => {
          dispatch(
            updateAnswer({
              id: a.id,
              data: { isCorrect: a.isCorrect }
            })
          )
        })

        return normalized
      })
    }
  }

  /* ===== TOGGLE CORRECT ===== */
  const toggleCorrect = answerId => {
    setAnswers(prev =>
      prev.map(a => {
        if (type === 'SINGLE') {
          return { ...a, isCorrect: a.id === answerId }
        }

        if (a.id === answerId) {
          return { ...a, isCorrect: !a.isCorrect }
        }

        return a
      })
    )
  }

  /* ===== SAVE ANSWERS ===== */
  const saveAnswers = () => {
    answers.forEach(a => {
      const original = q.answers.find(x => x.id === a.id)
      if (!original) return

      if (original.text !== a.text || original.isCorrect !== a.isCorrect) {
        dispatch(
          updateAnswer({
            id: a.id,
            data: {
              text: a.text,
              isCorrect: a.isCorrect
            }
          })
        )
      }
    })
  }

  return (
    <div className={styles.questionCard}>
      <div className={styles.questionTop}>
        <input
          value={text}
          placeholder='Текст вопроса'
          onChange={e => setText(e.target.value)}
          onBlur={saveQuestionText}
        />

        <select value={type} onChange={e => changeType(e.target.value)}>
          <option value='SINGLE'>Один правильный</option>
          <option value='MULTIPLE'>Несколько правильных</option>
        </select>

        <button onClick={() => dispatch(deleteQuestion(q.id))}>🗑</button>
      </div>

      <div className={styles.answers}>
        {answers.map(a => (
          <div key={a.id} className={styles.answer}>
            <input
              type={type === 'SINGLE' ? 'radio' : 'checkbox'}
              checked={a.isCorrect}
              onChange={() => toggleCorrect(a.id)}
              onBlur={saveAnswers}
            />

            <input
              value={a.text}
              placeholder='Вариант ответа'
              onChange={e =>
                setAnswers(prev =>
                  prev.map(x =>
                    x.id === a.id ? { ...x, text: e.target.value } : x
                  )
                )
              }
              onBlur={saveAnswers}
            />

            <button
              onClick={() =>
                dispatch(
                  deleteAnswer({
                    id: a.id,
                    questionId: q.id
                  })
                )
              }
            >
              🗑
            </button>
          </div>
        ))}

        <button
          className={styles.addAnswer}
          onClick={() =>
            dispatch(
              createAnswer({
                questionId: q.id,
                data: { text: 'New answer' }
              })
            )
          }
        >
          + Ответ
        </button>
      </div>
    </div>
  )
}
