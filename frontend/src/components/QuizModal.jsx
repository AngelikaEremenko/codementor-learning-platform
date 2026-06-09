import { useState } from 'react'
import { Check, X, Lightbulb } from 'lucide-react'
import api from '../api'
import { useUser } from './Layout'
import { points as pointsWord } from '../utils/plural'

const LABELS = { a: 'A', b: 'B', c: 'C', d: 'D' }
const OPTIONS = ['a', 'b', 'c', 'd']

export default function QuizModal({ theoryId, theoryTitle, questions, onClose }) {
  const { refreshUser } = useUser()
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)

  const q = questions[currentIdx]
  const total = questions.length
  const isLast = currentIdx === total - 1
  const allAnswered = questions.every(q => answers[q.id])

  function pickAnswer(qid, option) {
    if (result) return
    setAnswers(prev => ({ ...prev, [qid]: option }))
  }

  async function submitQuiz() {
    setLoading(true)
    try {
      const res = await api.post(`/theories/${theoryId}/check-quiz/`, { answers })
      setResult(res.data)
      // Если за прохождение теории начислены баллы, обновляем шапку
      if (res.data.points_earned > 0) {
        refreshUser()
      }
    } catch {
      alert('Ошибка при отправке теста.')
    } finally {
      setLoading(false)
    }
  }

  function restart() {
    setAnswers({})
    setResult(null)
    setCurrentIdx(0)
  }

  function qResult(qid) {
    if (!result) return null
    return result.results.find(r => r.id === qid)
  }

  const pct = result ? Math.round((result.score / result.total) * 100) : 0

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 14,
        width: '100%',
        maxWidth: 640,
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '32px 36px',
        position: 'relative',
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
        color: '#1e293b',
      }}>
        {/* Закрыть */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 16,
            background: 'none', border: 'none',
            fontSize: 24, cursor: 'pointer', color: '#64748b',
            lineHeight: 1, padding: '4px 8px',
          }}
        >×</button>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Тест по теме
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#1e293b' }}>{theoryTitle}</h2>
        </div>

        {/* Результат-баннер */}
        {result && (
          <div style={{
            background: pct >= 70 ? '#dcfce7' : '#fee2e2',
            border: `1.5px solid ${pct >= 70 ? '#16a34a' : '#dc2626'}`,
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 24,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: pct >= 70 ? '#16a34a' : '#dc2626' }}>
              {result.score}/{result.total}
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
              {pct >= 70
                ? 'Отлично! Тема усвоена.'
                : 'Рекомендуем вернуться к теории и попробовать ещё раз.'}
            </div>
            {result.points_earned > 0 && (
              <div style={{
                marginTop: 12,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--white)',
                border: '1px solid var(--success)',
                color: 'var(--success)',
                fontWeight: 700, fontSize: 14,
                padding: '6px 14px', borderRadius: 'var(--radius-full)',
              }}>
                +{result.points_earned} {pointsWord(result.points_earned)} за прохождение теории
              </div>
            )}
          </div>
        )}

        {/* Прогресс-точки (во время прохождения) */}
        {!result && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {questions.map((q, i) => {
                const isCurrent = i === currentIdx
                const isAnswered = !!answers[q.id]
                let bg = '#e2e8f0'   // не отвечен
                let color = '#64748b'
                if (isCurrent) {
                  bg = 'var(--primary)'; color = '#fff'
                } else if (isAnswered) {
                  bg = '#94a3b8'    // нейтрально-серый — «есть ответ», но не «правильно»
                  color = '#fff'
                }
                return (
                  <div
                    key={q.id}
                    onClick={() => setCurrentIdx(i)}
                    title={isAnswered ? 'Ответ выбран — можно изменить' : 'Без ответа'}
                    style={{
                      width: 30, height: 30, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: bg, color,
                      transition: 'background 0.15s',
                      userSelect: 'none',
                    }}
                  >
                    {i + 1}
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Вопрос {currentIdx + 1} из {total}
            </div>
          </div>
        )}

        {/* Режим прохождения */}
        {!result && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, lineHeight: 1.6, color: '#1e293b' }}>
              {q.question}
            </div>

            {OPTIONS.map(opt => {
              const text = q[`option_${opt}`]
              const selected = answers[q.id] === opt
              return (
                <div
                  key={opt}
                  onClick={() => pickAnswer(q.id, opt)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px', borderRadius: 8, marginBottom: 10,
                    border: `1.5px solid ${selected ? 'var(--primary)' : '#e2e8f0'}`,
                    background: selected ? '#e0e7ff' : '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 13,
                    background: selected ? 'var(--primary)' : '#e2e8f0',
                    color: selected ? '#fff' : '#64748b',
                  }}>
                    {LABELS[opt]}
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1.5, paddingTop: 4, color: '#1e293b' }}>{text}</span>
                </div>
              )
            })}

            {/* Навигация */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, gap: 10 }}>
              <button
                onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                disabled={currentIdx === 0}
                style={{
                  background: '#e2e8f0', color: '#1e293b',
                  border: 'none', borderRadius: 7, padding: '8px 18px',
                  cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
                  opacity: currentIdx === 0 ? 0.5 : 1,
                  fontWeight: 500,
                }}
              >
                ← Назад
              </button>

              {isLast ? (
                <button
                  onClick={submitQuiz}
                  disabled={!allAnswered || loading}
                  style={{
                    background: allAnswered ? 'var(--primary)' : '#e2e8f0',
                    color: allAnswered ? '#fff' : '#64748b',
                    border: 'none', borderRadius: 7,
                    padding: '8px 22px', fontWeight: 700,
                    cursor: allAnswered ? 'pointer' : 'not-allowed',
                  }}
                >
                  {loading ? 'Проверяем...' : 'Завершить тест'}
                </button>
              ) : (
                <button
                  onClick={() => setCurrentIdx(i => Math.min(total - 1, i + 1))}
                  style={{
                    background: 'var(--primary)', color: '#fff',
                    border: 'none', borderRadius: 7, padding: '8px 18px',
                    cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  Далее →
                </button>
              )}
            </div>

            {isLast && !allAnswered && (
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: '#64748b' }}>
                Ответьте на все вопросы, чтобы завершить тест.
              </div>
            )}
          </div>
        )}

        {/* Режим результатов */}
        {result && (
          <div>
            {questions.map((q, i) => {
              const r = qResult(q.id)
              const userAnswer = answers[q.id]
              return (
                <div key={q.id} style={{
                  border: `1.5px solid ${r?.correct ? '#16a34a' : '#dc2626'}`,
                  borderRadius: 10, padding: '14px 18px', marginBottom: 14,
                  background: r?.correct ? '#f0fdf4' : '#fef2f2',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14, color: '#1e293b' }}>
                    {i + 1}. {q.question}
                  </div>
                  {OPTIONS.map(opt => {
                    const text = q[`option_${opt}`]
                    const isCorrect = r?.correct_answer === opt
                    const isUser = userAnswer === opt
                    let bg = 'transparent'
                    let border = '#e2e8f0'
                    let color = '#1e293b'
                    if (isCorrect) { bg = '#dcfce7'; border = '#16a34a'; color = '#15803d' }
                    else if (isUser && !isCorrect) { bg = '#fee2e2'; border = '#dc2626'; color = '#dc2626' }
                    return (
                      <div key={opt} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '8px 12px', borderRadius: 6, marginBottom: 6,
                        border: `1.5px solid ${border}`,
                        background: bg, color,
                      }}>
                        <span style={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{LABELS[opt]}.</span>
                        <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>{text}</span>
                        {isCorrect && <Check size={16} strokeWidth={3} style={{ flexShrink: 0 }} />}
                        {isUser && !isCorrect && <X size={16} strokeWidth={3} style={{ flexShrink: 0 }} />}
                      </div>
                    )
                  })}
                  {r?.explanation && (
                    <div style={{
                      marginTop: 10, fontSize: 13, color: '#16a34a',
                      borderTop: '1px solid #e2e8f0', paddingTop: 8, lineHeight: 1.5,
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                      <Lightbulb size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{r.explanation}</span>
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'center' }}>
              <button
                onClick={restart}
                style={{
                  background: '#e2e8f0', color: '#1e293b',
                  border: 'none', borderRadius: 7, padding: '10px 22px',
                  cursor: 'pointer', fontWeight: 500,
                }}
              >
                Пройти ещё раз
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'var(--primary)', color: '#fff',
                  border: 'none', borderRadius: 7, padding: '10px 22px',
                  fontWeight: 700, cursor: 'pointer',
                }}
              >
                Вернуться к теории
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
