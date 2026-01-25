import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import {
  startTest,
  submitTest
} from '../../../store/testSession/testSessionThunks'
import {
  setAnswer,
  tick,
  clearSession
} from '../../../store/testSession/testSessionSlice'
import {
  fetchMyTestResult,
  fetchTest,
  fetchTestResults
} from '../../../store/tests/testThunks'

import styles from './TestViewer.module.scss'

export default function TestViewer ({ testId }) {
  const dispatch = useDispatch()

  const user = useSelector(state => state.user.user)
  const isTeacher = user?.role === 'TEACHER'

  const test = useSelector(state => state.test.current)
  const { lastResult, results, loading } = useSelector(state => state.test)
  const { session, answers, timeLeft, finished, result } = useSelector(
    state => state.testSession
  )

  const finalResult = result || lastResult
  const isPerfect = finalResult?.score === 100
  const canRetry = !isPerfect

  const questions = test?.questions || []
  const details = finalResult?.details || []

  /* ===== LOAD DATA ===== */
  useEffect(() => {
    dispatch(clearSession())
    dispatch(fetchTest(testId))

    if (isTeacher) {
      dispatch(fetchTestResults(testId))
    } else {
      dispatch(fetchMyTestResult(testId))
    }
  }, [testId, isTeacher, dispatch])

  /* ===== START ===== */
  const handleStart = () => {
    dispatch(clearSession())
    dispatch(startTest(testId))
  }

  useEffect(() => {
    if (finished && !isTeacher) {
      dispatch(fetchMyTestResult(testId))
    }
  }, [finished, isTeacher, dispatch, testId])

  /* ===== TIMER ===== */
  useEffect(() => {
    if (!session || finished) return
    const timer = setInterval(() => dispatch(tick()), 1000)
    return () => clearInterval(timer)
  }, [session, finished, dispatch])

  /* ===== AUTO SUBMIT ===== */
  useEffect(() => {
    if (timeLeft === 0 && session && !finished) {
      dispatch(submitTest({ testResultId: session.testResultId, answers }))
    }
  }, [timeLeft, session, finished, answers, dispatch])

  /* ===== ANSWERS ===== */
  const handleAnswerChange = (question, answerId) => {
    const prev = answers[question.id] || []

    const updated =
      question.type === 'SINGLE'
        ? [answerId]
        : prev.includes(answerId)
        ? prev.filter(id => id !== answerId)
        : [...prev, answerId]

    dispatch(setAnswer({ questionId: question.id, answerIds: updated }))
  }

  const handleSubmit = () => {
    dispatch(submitTest({ testResultId: session.testResultId, answers }))
  }

  /* ================= RENDER ================= */

  if (!test) {
    return <p className={styles.empty}>Тест не найден</p>
  }

  /* ================= TEACHER ================= */

  if (isTeacher) {
    return (
      <div className={styles.card}>
        <h2 className={styles.title}>{test.title}</h2>

        <div className={styles.meta}>
          <span>⏱ {test.timeLimit} мин</span>
          <span>Проходной балл: {test.passingScore}%</span>
          <span>Вопросов: {test.questions.length}</span>
        </div>

        {results.length === 0 ? (
          <p className={styles.empty}>Нет завершённых попыток</p>
        ) : (
          <table className={styles.resultsTable}>
            <thead>
              <tr>
                <th>Студент</th>
                <th>Email</th>
                <th>Попытка</th>
                <th>Баллы</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={`${r.userId}-${r.attempt}`}>
                  <td>{r.userName}</td>
                  <td>{r.email}</td>
                  <td>{r.attempt}</td>
                  <td>{r.score}%</td>
                  <td>
                    <span className={r.passed ? styles.passed : styles.failed}>
                      {r.passed ? 'Пройден' : 'Не пройден'}
                    </span>
                  </td>
                  <td>{new Date(r.finishedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  /* ================= STUDENT RESULT ================= */

  if (!session && finalResult) {
    return (
      <div className={styles.resultCard}>
        <div className={styles.resultLayout}>
          <aside className={styles.resultSide}>
            <h2 className={styles.title}>
              {isPerfect
                ? '🏆 Идеальный результат'
                : finalResult.passed
                ? '✅ Тест пройден'
                : '❌ Тест не пройден'}
            </h2>

            <div className={styles.score}>{finalResult.score}%</div>

            <div className={styles.metaBox}>
              Проходной балл: {test.passingScore}%
            </div>

            <div className={styles.date}>
              {new Date(finalResult.finishedAt).toLocaleString()}
            </div>

            {canRetry && (
              <button className={styles.startBtn} onClick={handleStart}>
                Пройти ещё раз
              </button>
            )}
          </aside>

          <section className={styles.resultMain}>
            <div className={styles.details}>
              {questions.map(q => {
                const d = details.find(x => x.questionId === q.id)
                if (!d) return null

                return (
                  <div key={q.id} className={styles.detailQuestion}>
                    <h4 className={styles.questionTitle}>{q.text}</h4>

                    <div className={styles.answers}>
                      {q.answers.map(a => {
                        const picked = d.userAnswerIds.includes(a.id)
                        const correct = d.correctAnswerIds.includes(a.id)

                        return (
                          <div
                            key={a.id}
                            className={`${styles.answerRow}
                              ${correct ? styles.correct : ''}
                              ${picked && !correct ? styles.wrong : ''}
                            `}
                          >
                            <span className={styles.answerIcon}>
                              {correct ? '✔' : picked ? '✖' : ''}
                            </span>
                            <span>{a.text}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    )
  }

  /* ================= PREVIEW ================= */

  if (!session) {
    return (
      <div className={styles.card}>
        <h2 className={styles.title}>{test.title}</h2>

        <div className={styles.meta}>
          <span>⏱ {test.timeLimit} мин</span>
          <span>Проходной балл: {test.passingScore}%</span>
        </div>

        <button
          className={styles.startBtn}
          onClick={handleStart}
          disabled={loading}
        >
          Начать тест
        </button>
      </div>
    )
  }

  /* ================= IN PROGRESS ================= */

  return (
    <div className={styles.card}>
      <div className={styles.timer}>
        Осталось: {Math.floor(timeLeft / 60)}:
        {(timeLeft % 60).toString().padStart(2, '0')}
      </div>

      {session.questions.map(q => (
        <div key={q.id} className={styles.question}>
          <h4>{q.text}</h4>

          {q.answers.map(a => (
            <label key={a.id} className={styles.answer}>
              <input
                type={q.type === 'SINGLE' ? 'radio' : 'checkbox'}
                checked={(answers[q.id] || []).includes(a.id)}
                onChange={() => handleAnswerChange(q, a.id)}
              />
              {a.text}
            </label>
          ))}
        </div>
      ))}

      <button className={styles.submitBtn} onClick={handleSubmit}>
        Завершить тест
      </button>
    </div>
  )
}
