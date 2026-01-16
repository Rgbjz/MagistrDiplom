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

  /* ===== QUESTIONS ===== */
  const addQuestion = () => {
    dispatch(
      createQuestion({
        testId: test.id,
        data: {
          text: 'New question',
          type: 'SINGLE'
        }
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
          <div key={q.id} className={styles.questionCard}>
            {/* ===== QUESTION TOP ===== */}
            <div className={styles.questionTop}>
              <input
                value={q.text}
                placeholder='Текст вопроса'
                onChange={e =>
                  dispatch(
                    updateQuestion({
                      id: q.id,
                      data: { text: e.target.value }
                    })
                  )
                }
              />

              <select
                value={q.type}
                onChange={e =>
                  dispatch(
                    updateQuestion({
                      id: q.id,
                      data: { type: e.target.value }
                    })
                  )
                }
              >
                <option value='SINGLE'>Один правильный</option>
                <option value='MULTIPLE'>Несколько правильных</option>
              </select>

              <button onClick={() => dispatch(deleteQuestion(q.id))}>🗑</button>
            </div>

            {/* ===== ANSWERS ===== */}
            <div className={styles.answers}>
              {(q.answers || []).map(a => (
                <div key={a.id} className={styles.answer}>
                  <input
                    type={q.type === 'SINGLE' ? 'radio' : 'checkbox'}
                    checked={a.isCorrect}
                    onChange={() => {
                      if (q.type === 'SINGLE') {
                        // сбрасываем все ответы
                        q.answers.forEach(ans => {
                          dispatch(
                            updateAnswer({
                              id: ans.id,
                              data: { isCorrect: ans.id === a.id }
                            })
                          )
                        })
                      } else {
                        dispatch(
                          updateAnswer({
                            id: a.id,
                            data: { isCorrect: !a.isCorrect }
                          })
                        )
                      }
                    }}
                  />

                  <input
                    value={a.text}
                    placeholder='Вариант ответа'
                    onChange={e =>
                      dispatch(
                        updateAnswer({
                          id: a.id,
                          data: { text: e.target.value }
                        })
                      )
                    }
                  />

                  <button onClick={() => dispatch(deleteAnswer(a.id))}>
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
                      data: { text: 'new answer' }
                    })
                  )
                }
              >
                + Добавить ответ
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
