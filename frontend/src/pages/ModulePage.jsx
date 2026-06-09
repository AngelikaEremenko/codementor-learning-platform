import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Lock, Check, AlertTriangle, Circle, Play } from 'lucide-react'
import api from '../api'
import RunnableCodeBlock from '../components/RunnableCodeBlock'
import MiniTaskBlock from '../components/MiniTaskBlock'
import QuizModal from '../components/QuizModal'

const DIFF = { 1: 'Базовый', 2: 'Средний', 3: 'Продвинутый' }

/**
 * Разбивает markdown-текст теории на части:
 *   - обычный markdown
 *   - блоки `cpp-run` (запускаемый код)
 *   - маркеры `[mini-task:N]` (вставка мини-задания N-го по порядку)
 *
 * Дополнительно: если контент начинается с `# Заголовок` — этот заголовок
 * убирается, чтобы он не дублировал название теории (оно выводится отдельно
 * как фиолетовый title над текстом).
 */
function splitContent(content) {
  // Убираем ведущий `# заголовок` из самого контента
  let cleaned = content.replace(/^\s*#\s+[^\n]*\n+/, '')

  const parts = []
  // Ловим оба типа блоков одной регуляркой, в порядке появления
  const regex = /```cpp-run\n([\s\S]*?)```|\[mini-task:(\d+)\]/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'md', text: cleaned.slice(lastIndex, match.index) })
    }
    if (match[1] !== undefined) {
      parts.push({ type: 'run', code: match[1] })
    } else {
      parts.push({ type: 'mini', index: parseInt(match[2], 10) })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < cleaned.length) {
    parts.push({ type: 'md', text: cleaned.slice(lastIndex) })
  }

  return parts
}

const mdComponents = {
  code({ className, children }) {
    const isBlock = /language-\w+/.test(className || '')
    if (isBlock) {
      return (
        <pre style={{
          background: '#1e293b', color: '#e2e8f0',
          borderRadius: 8, padding: '14px 18px',
          overflowX: 'auto', margin: '12px 0', fontSize: 13,
          lineHeight: 1.6, whiteSpace: 'pre',
        }}>
          <code style={{ fontFamily: 'Consolas, Monaco, monospace' }}>
            {children}
          </code>
        </pre>
      )
    }
    return (
      <code style={{
        background: '#f1f5f9', borderRadius: 3,
        padding: '0 3px', fontFamily: 'Consolas, Monaco, monospace',
        fontSize: '0.9em', color: 'var(--primary)',
      }}>
        {children}
      </code>
    )
  },
  pre({ children }) {
    return <>{children}</>
  },
}

function TheoryContent({ content, miniTasks, onMiniPass }) {
  const parts = splitContent(content)
  const usedMini = new Set()

  const rendered = parts.map((part, i) => {
    if (part.type === 'run') {
      let hint = ''
      let code = part.code
      const firstLine = code.split('\n')[0]
      if (firstLine.startsWith('// hint:')) {
        hint = firstLine.replace('// hint:', '').trim()
        code = code.split('\n').slice(1).join('\n')
      }
      return <RunnableCodeBlock key={i} initialCode={code} taskHint={hint} />
    }
    if (part.type === 'mini') {
      const mini = miniTasks?.[part.index]
      if (!mini) return null
      usedMini.add(mini.id)
      return (
        <MiniTaskBlock
          key={`mini-${mini.id}`}
          task={mini}
          alreadyPassed={mini.passed}
          onPass={onMiniPass}
        />
      )
    }
    return (
      <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents}>
        {part.text}
      </ReactMarkdown>
    )
  })

  // Любые мини-задания, которые не были упомянуты в content через [mini-task:N], показываем в конце
  const trailing = (miniTasks || [])
    .filter(m => !usedMini.has(m.id))
    .map(m => (
      <MiniTaskBlock
        key={`mini-trail-${m.id}`}
        task={m}
        alreadyPassed={m.passed}
        onPass={onMiniPass}
      />
    ))

  return <>{rendered}{trailing}</>
}

function TheoryProgressPill({ theory }) {
  const total = theory.mini_tasks?.length || 0
  const passed = theory.mini_tasks?.filter(m => m.passed).length || 0
  const allMini = total === 0 || passed === total
  const quizPassed = theory.quiz_passed
  const completed = theory.completed
  const hasQuiz = (theory.quiz?.questions?.length || 0) > 0

  let label, color, bg
  if (completed) {
    label = <><Check size={11} strokeWidth={3} /> Пройдено</>
    color = '#15803d'; bg = '#dcfce7'
  } else if (allMini && hasQuiz && !quizPassed) {
    label = 'Сдай тест'
    color = '#92400e'; bg = '#fef3c7'
  } else {
    label = `Практика ${passed}/${total}`
    color = '#92400e'; bg = '#fef3c7'
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 9px',
      borderRadius: 10, color, background: bg,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {label}
    </span>
  )
}

export default function ModulePage() {
  const { moduleId } = useParams()
  const navigate = useNavigate()
  const [mod, setMod] = useState(null)
  const [loading, setLoading] = useState(true)
  // Активную теорию храним в URL (?theory=N) — чтобы при перезагрузке страницы
  // позиция не терялась и ссылку можно было передать другому пользователю.
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTheory = Math.max(0, parseInt(searchParams.get('theory') || '0', 10) || 0)
  const setActiveTheory = useCallback((i) => {
    setSearchParams({ theory: String(i) }, { replace: true })
  }, [setSearchParams])
  const [tab, setTab] = useState('theory')
  const [quizOpen, setQuizOpen] = useState(false)

  const reload = useCallback(() => {
    api.get(`/modules/${moduleId}/`)
      .then(r => {
        setMod(r.data)
        setLoading(false)
      })
      .catch(err => {
        setLoading(false)
        // Модуль не найден (404) или закрыт гейтингом (403) — возвращаем
        // пользователя на список модулей вместо бесконечной «Загрузки».
        const status = err.response?.status
        if (status === 404 || status === 403) {
          navigate('/', { replace: true })
        }
      })
  }, [moduleId, navigate])

  useEffect(() => { reload() }, [reload])

  useEffect(() => { setQuizOpen(false) }, [activeTheory])

  // После сдачи мини-задания на сервере прогресс уже обновлён;
  // обновляем локально, чтобы UI сразу показал отметку «сдано».
  function markMiniPassed(miniId) {
    setMod(prev => prev && ({
      ...prev,
      theories: prev.theories.map(t => ({
        ...t,
        mini_tasks: t.mini_tasks.map(m => m.id === miniId ? { ...m, passed: true } : m),
      })),
    }))
  }

  function handleQuizClosed() {
    setQuizOpen(false)
    // Подтягиваем актуальный прогресс с сервера (флаги completed/quiz_passed)
    reload()
  }

  async function startAdaptive() {
    if (!mod?.tasks_unlocked) {
      alert('Сначала пройдите все теории и тесты этого модуля.')
      return
    }
    try {
      const res = await api.get(`/modules/${moduleId}/next-task/`)
      if (res.data.completed) {
        alert('Вы завершили все задачи этого модуля!')
        return
      }
      navigate(`/modules/${moduleId}/tasks/${res.data.id}`)
    } catch {
      alert('Ошибка загрузки задачи')
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Загрузка...</div>
  if (!mod) return null

  const theory = mod.theories[activeTheory]
  const hasQuiz = (theory?.quiz?.questions?.length || 0) > 0
  const allMiniPassed = (theory?.mini_tasks || []).every(m => m.passed)
  const quizLocked = !allMiniPassed && !theory?.quiz_passed
  const tasksUnlocked = mod.tasks_unlocked
  const theoriesTotal = mod.theories.length
  const theoriesCompleted = mod.theories.filter(t => t.completed).length

  return (
    <div>
      <div style={{ marginBottom: 20, fontSize: 14, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link to="/" style={{ color: 'var(--primary)' }}>Модули</Link>
        <span>›</span>
        <span>{mod.title}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700 }}>{mod.title}</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>{mod.description}</p>
        </div>
        <button
          className="btn-primary"
          onClick={startAdaptive}
          disabled={!tasksUnlocked}
          title={tasksUnlocked ? '' : 'Сначала пройдите все теории'}
          style={{
            whiteSpace: 'nowrap', marginLeft: 16,
            opacity: tasksUnlocked ? 1 : 0.5,
            cursor: tasksUnlocked ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          {tasksUnlocked ? (
            <><Play size={14} fill="currentColor" /> Решать задачи</>
          ) : (
            <><Lock size={14} /> Задачи заблокированы</>
          )}
        </button>
      </div>

      {/* Прогрессбар по теориям */}
      <div style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '12px 18px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
            Изучено теорий: <b>{theoriesCompleted}</b> из <b>{theoriesTotal}</b>
            {!tasksUnlocked && theoriesCompleted < theoriesTotal && (
              <span style={{ marginLeft: 8, color: '#d97706' }}>
                — пройдите все, чтобы открыть задачи
              </span>
            )}
            {tasksUnlocked && (
              <span style={{ marginLeft: 8, color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Check size={13} strokeWidth={3} /> Задачи открыты
              </span>
            )}
          </div>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${theoriesTotal ? (theoriesCompleted / theoriesTotal) * 100 : 0}%`,
              background: tasksUnlocked ? '#16a34a' : 'var(--primary)',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--border)' }}>
        {['theory', 'tasks'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: tab === t ? 700 : 400,
              borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
              borderRadius: 0,
              padding: '8px 16px',
              marginBottom: -2,
            }}
          >
            {t === 'theory' ? `Теория (${mod.theories.length})` : `Задачи (${mod.tasks.length})`}
            {t === 'tasks' && !tasksUnlocked && <Lock size={12} style={{ marginLeft: 6, verticalAlign: 'middle' }} />}
          </button>
        ))}
      </div>

      {tab === 'theory' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
          <div>
            {mod.theories.map((t, i) => {
              // Теория i доступна, если предыдущая (i-1) пройдена.
              // Первая — всегда доступна.
              const prev = i > 0 ? mod.theories[i - 1] : null
              const isLocked = prev != null && !prev.completed
              return (
                <div
                  key={t.id}
                  onClick={() => { if (!isLocked) setActiveTheory(i) }}
                  title={isLocked ? 'Сначала завершите предыдущую теорию (мини-задания + тест)' : ''}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 6,
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    background: activeTheory === i ? 'var(--primary-light)' : 'transparent',
                    color: activeTheory === i ? 'var(--primary)' : 'var(--text)',
                    fontWeight: activeTheory === i ? 600 : 400,
                    marginBottom: 4,
                    fontSize: 14,
                    transition: 'background 0.15s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    opacity: isLocked ? 0.45 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isLocked && <Lock size={12} />}
                    {!isLocked && t.completed && <Check size={13} strokeWidth={3} style={{ color: '#16a34a' }} />}
                    <span>{i + 1}. {t.title}</span>
                  </div>
                  {isLocked ? (
                    <span style={{
                      fontSize: 11, color: 'var(--text-muted)', fontWeight: 500,
                    }}>
                      Откроется после прохождения предыдущей
                    </span>
                  ) : (
                    <TheoryProgressPill theory={t} />
                  )}
                </div>
              )
            })}
          </div>

          {theory && (
            <div>
              <div className="card markdown">
                <h2 style={{ marginBottom: 8, color: 'var(--primary)', fontSize: 20 }}>{theory.title}</h2>
                <div style={{ marginBottom: 20 }}>
                  <TheoryProgressPill theory={theory} />
                </div>
                <TheoryContent
                  content={theory.content}
                  miniTasks={theory.mini_tasks}
                  onMiniPass={markMiniPassed}
                />
              </div>

              {hasQuiz && !quizOpen && (
                <div style={{
                  marginTop: 20,
                  textAlign: 'center',
                  background: theory.quiz_passed ? '#f0fdf4' : (quizLocked ? '#f8fafc' : '#fffbeb'),
                  border: `1.5px solid ${theory.quiz_passed ? '#86efac' : (quizLocked ? '#cbd5e1' : '#fde68a')}`,
                  borderRadius: 10,
                  padding: '20px 24px',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {theory.quiz_passed ? (
                      <><Check size={16} strokeWidth={2.8} /> Тест пройден</>
                    ) : quizLocked ? (
                      <><Lock size={16} /> Тест заблокирован</>
                    ) : (
                      'Тест по теме'
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                    {quizLocked
                      ? 'Сначала выполните все мини-задания выше — после этого откроется тест.'
                      : 'Для прохождения нужно ответить правильно минимум на 75% вопросов.'}
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => setQuizOpen(true)}
                    disabled={quizLocked}
                    style={{
                      padding: '12px 32px', fontSize: 15,
                      opacity: quizLocked ? 0.5 : 1,
                      cursor: quizLocked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {theory.quiz_passed ? 'Пройти тест ещё раз' : 'Пройти тест'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <>
          {!tasksUnlocked && (
            <div style={{
              background: '#fef3c7',
              border: '1.5px solid #f59e0b',
              borderRadius: 10,
              padding: '16px 20px',
              marginBottom: 16,
              color: '#78350f',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Lock size={14} /> Задачи модуля заблокированы
              </div>
              <div style={{ fontSize: 14 }}>
                Сначала пройдите все теории, выполните практические мини-задания и сдайте тесты.
                После этого задачи откроются автоматически.
              </div>
            </div>
          )}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            opacity: tasksUnlocked ? 1 : 0.55,
            pointerEvents: tasksUnlocked ? 'auto' : 'none',
          }}>
            {mod.tasks.map(task => {
              const mastery = task.mastery || 'not_attempted'
              const isTaskLocked = task.locked === true
              const masteryInfo = isTaskLocked
                ? { icon: <Lock size={14} />, label: 'Заблокирована', color: '#64748b', bg: '#f1f5f9' }
                : {
                    mastered: { icon: <Check size={16} strokeWidth={2.8} />, label: 'Освоено', color: '#15803d', bg: '#dcfce7' },
                    solved_weak: { icon: <AlertTriangle size={16} />, label: 'Решено — нужно закрепление', color: '#b45309', bg: '#fef3c7' },
                    not_attempted: { icon: <Circle size={14} />, label: 'Не решено', color: '#64748b', bg: '#f1f5f9' },
                  }[mastery]

              const cardContent = (
                <div
                  className="card"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 24px',
                    cursor: isTaskLocked ? 'not-allowed' : 'pointer',
                    opacity: isTaskLocked ? 0.55 : 1,
                  }}
                  onMouseEnter={e => {
                    if (!isTaskLocked) e.currentTarget.style.boxShadow = 'var(--shadow-md)'
                  }}
                  onMouseLeave={e => {
                    if (!isTaskLocked) e.currentTarget.style.boxShadow = 'var(--shadow)'
                  }}
                  title={isTaskLocked ? 'Сначала освойте предыдущую задачу' : ''}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 'var(--radius-full)',
                    background: masteryInfo.bg, color: masteryInfo.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, marginRight: 14, flexShrink: 0,
                  }} title={masteryInfo.label}>
                    {masteryInfo.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{task.title}</div>
                    {isTaskLocked ? (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        Откроется после освоения предыдущей задачи
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: task.tags?.length ? 6 : 0 }}>
                        {task.description.substring(0, 80)}...
                      </div>
                    )}
                    {!isTaskLocked && mastery === 'solved_weak' && task.variations_total > 0 && (
                      <div style={{ fontSize: 11, color: '#b45309', marginBottom: 6, fontWeight: 600 }}>
                        Решено {task.variations_solved} из {task.variations_total} задач для закрепления
                      </div>
                    )}
                    {!isTaskLocked && task.tags?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {task.tags.map(t => (
                          <span key={t.id} style={{
                            fontSize: 11,
                            background: '#f1f5f9',
                            color: '#475569',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            fontWeight: 500,
                          }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className={`badge badge-${task.difficulty}`} style={{ marginLeft: 16, flexShrink: 0 }}>
                    {DIFF[task.difficulty]}
                  </span>
                </div>
              )

              if (isTaskLocked) {
                return <div key={task.id}>{cardContent}</div>
              }
              return (
                <Link key={task.id} to={`/modules/${moduleId}/tasks/${task.id}`}>
                  {cardContent}
                </Link>
              )
            })}
          </div>
        </>
      )}

      {quizOpen && theory && hasQuiz && (
        <QuizModal
          theoryId={theory.id}
          theoryTitle={theory.title}
          questions={theory.quiz.questions}
          onClose={handleQuizClosed}
        />
      )}
    </div>
  )
}
