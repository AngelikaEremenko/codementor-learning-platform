import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Check, CheckCircle2, XCircle, AlertTriangle, Timer,
  ClipboardList, Lightbulb, BarChart3, Cog, Star, Loader2, Play,
  Terminal,
} from 'lucide-react'
import api from '../api'
import { useUser } from '../components/Layout'
import { points as pointsWord } from '../utils/plural'
import { labelExampleBlocks } from '../utils/markdown'

const DIFF = { 1: 'Базовый', 2: 'Средний', 3: 'Продвинутый' }
const MAX_HINT_LEVEL = 2
// Стоимость подсказок по уровням — должна совпадать с HINT_COST_BY_LEVEL на сервере.
const HINT_COST_BY_LEVEL = { 1: 0, 2: 3 }

// Нормализация кода для сравнения — реплика серверной логики (assistant/views.py).
// Удаляем однострочные/многострочные комментарии и все пробельные символы.
function normalizeCode(code) {
  if (!code) return ''
  return code
    .replace(/\/\/.*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, '')
}
const STATUS_LABELS = {
  accepted: <><CheckCircle2 size={18} strokeWidth={2.4} /> Принято</>,
  wrong: <><XCircle size={18} /> Неверный ответ</>,
  error: <><AlertTriangle size={18} /> Ошибка выполнения</>,
  timeout: <><Timer size={18} /> Превышено время</>,
}

function MasteryBanner({ task }) {
  const mastery = task.mastery || 'not_attempted'
  if (mastery === 'not_attempted') return null
  if (mastery === 'mastered') {
    return (
      <div style={{
        background: '#dcfce7', border: '1px solid #86efac',
        borderRadius: 8, padding: '10px 14px', marginBottom: 14,
        fontSize: 13, color: '#15803d', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Check size={15} strokeWidth={2.8} /> Задача освоена. Можно идти дальше.
      </div>
    )
  }
  // solved_weak
  const remaining = (task.variations_total || 0) - (task.variations_solved || 0)
  return (
    <div style={{
      background: '#fef3c7', border: '1px solid #fde68a',
      borderRadius: 8, padding: '10px 14px', marginBottom: 14,
      fontSize: 13, color: '#78350f',
    }}>
      <b>Задача решена, но не освоена.</b> Похоже, потребовалось время или подсказка.
      {remaining > 0
        ? ` Решите ${remaining} вариаций для закрепления — система выдаст их при нажатии «Следующая задача».`
        : ' Попробуйте решить ещё раз без подсказок и за разумное время — это закрепит тему.'}
    </div>
  )
}

const DEFAULT_CODE = `#include <iostream>
using namespace std;

int main() {
    // Напишите ваше решение здесь

    return 0;
}
`

export default function TaskPage() {
  const { moduleId, taskId } = useParams()
  const navigate = useNavigate()
  const { user, setUser } = useUser()
  const [task, setTask] = useState(null)
  const [code, setCode] = useState(DEFAULT_CODE)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [hint, setHint] = useState('')
  const [hintLevel, setHintLevel] = useState(null)
  const [codeAtLastHint, setCodeAtLastHint] = useState('')
  const [hintLoading, setHintLoading] = useState(false)
  const [hintUsed, setHintUsed] = useState(false)
  const [tab, setTab] = useState('task') // 'task' | 'hint' | 'results'
  const [pointsFlash, setPointsFlash] = useState(null) // '+5 баллов'
  const [runnerStdin, setRunnerStdin] = useState('')
  const [runnerRunning, setRunnerRunning] = useState(false)
  const [runnerResult, setRunnerResult] = useState(null) // { stdout, stderr, timed_out }
  const startTime = useRef(Date.now())

  // Предсказываем уровень следующей подсказки (та же логика, что на сервере):
  //   - первая подсказка по задаче → уровень 1;
  //   - повторный запрос с тем же нормализованным кодом → уровень min(prev+1, 2);
  //   - после изменения кода → сброс на уровень 1.
  const nextHintLevel = useMemo(() => {
    if (!hintLevel) return 1
    if (normalizeCode(code) === normalizeCode(codeAtLastHint)) {
      return Math.min(hintLevel + 1, MAX_HINT_LEVEL)
    }
    return 1
  }, [code, hintLevel, codeAtLastHint])
  const nextHintCost = HINT_COST_BY_LEVEL[nextHintLevel] || 0

  useEffect(() => {
    api.get(`/modules/${moduleId}/next-task/?task_id=${taskId}`)
      .then(r => {
        setTask(r.data)
        setCode(DEFAULT_CODE)
        setResult(null)
        setHint('')
        setHintLevel(null)
        setCodeAtLastHint('')
        setHintUsed(false)
        setTab('task')
        setRunnerStdin('')
        setRunnerResult(null)
        startTime.current = Date.now()
      })
      .catch(err => {
        const status = err.response?.status
        // 403 — задача недоступна (модуль заблокирован, теории не пройдены или
        // предыдущая задача не освоена). Возвращаем на страницу модуля,
        // где видна актуальная картина блокировок.
        if (status === 403) {
          navigate(`/modules/${moduleId}`, { replace: true })
        } else if (status === 404) {
          navigate('/', { replace: true })
        }
      })
  }, [moduleId, taskId, navigate])

  function showPointsFlash(text) {
    setPointsFlash(text)
    setTimeout(() => setPointsFlash(null), 2500)
  }

  async function handleSubmit() {
    setSubmitting(true)
    const timeSpent = Math.floor((Date.now() - startTime.current) / 1000)
    try {
      const res = await api.post(`/tasks/${taskId}/submit/`, {
        code,
        time_spent: timeSpent,
        used_hint: hintUsed,
      })
      setResult(res.data)
      setTab('results')

      // Обновляем баланс баллов в шапке
      if (res.data.points !== undefined) {
        setUser(u => ({ ...u, points: res.data.points }))
      }
      if (res.data.points_earned > 0) {
        showPointsFlash(`+${res.data.points_earned} ${pointsWord(res.data.points_earned)}`)
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.traceback || err.message || 'Неизвестная ошибка'
      console.error('Submit error:', err.response?.data || err)
      alert('Ошибка отправки решения:\n' + detail)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleHint() {
    if (user && nextHintCost > 0 && user.points < nextHintCost) return
    setHintLoading(true)
    setHintUsed(true)
    setTab('hint')
    try {
      const res = await api.post(`/tasks/${taskId}/hint/`, {
        code,
        last_result: result || null,
      })
      setHint(res.data.hint)
      setHintLevel(res.data.hint_level || 1)
      setCodeAtLastHint(code)

      // Обновляем баланс баллов в шапке
      if (res.data.points !== undefined) {
        setUser(u => ({ ...u, points: res.data.points }))
      }
      // Показываем уведомление о списании только если баллы реально списаны
      const cost = res.data.cost ?? 0
      if (cost > 0) {
        showPointsFlash(`-${cost} ${pointsWord(cost)}`)
      }
    } catch (err) {
      if (err.response?.status === 402) {
        setHint(`Недостаточно баллов для подсказки уровня 2. Решайте задачи, чтобы заработать баллы.`)
      } else {
        setHint('Не удалось получить подсказку. Попробуйте позже.')
      }
    } finally {
      setHintLoading(false)
    }
  }

  async function runCustom() {
    setRunnerRunning(true)
    setRunnerResult(null)
    try {
      const res = await api.post('/run-code/', { code, stdin: runnerStdin })
      setRunnerResult(res.data)
    } catch (err) {
      setRunnerResult({
        stdout: '',
        stderr: err.response?.data?.detail || err.message || 'Ошибка связи с сервером',
        timed_out: false,
      })
    } finally {
      setRunnerRunning(false)
    }
  }

  async function nextTask() {
    try {
      const res = await api.get(`/modules/${moduleId}/next-task/`)
      if (res.data.completed) {
        navigate(`/modules/${moduleId}`)
        return
      }
      navigate(`/modules/${moduleId}/tasks/${res.data.id}`)
    } catch {
      navigate(`/modules/${moduleId}`)
    }
  }

  const canHint = nextHintCost === 0 || !user || user.points >= nextHintCost

  if (!task) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Загрузка задачи...</div>

  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, height: 'calc(100vh - 120px)' }}>

      {/* Флеш-уведомление о баллах */}
      {pointsFlash && (
        <div style={{
          position: 'fixed', top: 70, right: 24, zIndex: 200,
          background: pointsFlash.startsWith('+') ? '#22c55e' : '#f97316',
          color: 'white', borderRadius: 10, padding: '8px 18px',
          fontWeight: 700, fontSize: 15, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          animation: 'fadeInDown 0.3s ease',
        }}>
          {pointsFlash}
        </div>
      )}

      {/* LEFT: Task description */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link to="/" style={{ color: 'var(--primary)' }}>Модули</Link>
          <span>›</span>
          <Link to={`/modules/${moduleId}`} style={{ color: 'var(--primary)' }}>Модуль</Link>
          <span>›</span>
          <span>{task.title}</span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', marginBottom: 0 }}>
          {['task', 'hint', 'results'].map(t => {
            const labels = {
              task: <><ClipboardList size={14} /> Задача</>,
              hint: <><Lightbulb size={14} /> Подсказка</>,
              results: <><BarChart3 size={14} /> Результат</>,
            }
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: 'none',
                  color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: tab === t ? 700 : 400,
                  borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
                  borderRadius: 0,
                  padding: '8px 14px',
                  marginBottom: -2,
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {labels[t]}
              </button>
            )
          })}
        </div>

        <div className="card" style={{ flex: 1, overflow: 'auto', borderRadius: '0 0 8px 8px' }}>
          {tab === 'task' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>{task.title}</h2>
                <span className={`badge badge-${task.difficulty}`}>{DIFF[task.difficulty]}</span>
              </div>
              {task.tags?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                  {task.tags.map(t => (
                    <span key={t.id} style={{
                      fontSize: 11,
                      background: '#f1f5f9',
                      color: '#475569',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontWeight: 500,
                    }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Баннер: эта задача — вариация для закрепления */}
              {task.is_variation && task.parent_task_title && (
                <div style={{
                  background: '#fef3c7', border: '1px solid #fde68a',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 14,
                  fontSize: 13, color: '#78350f',
                }}>
                  <b>Задача для закрепления.</b> Тема та же, что и в задаче «{task.parent_task_title}». Решите её, чтобы закрепить материал.
                </div>
              )}

              {/* Плашка статуса */}
              {!task.is_variation && (
                <MasteryBanner task={task} />
              )}

              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {labelExampleBlocks(task.description)}
                </ReactMarkdown>
              </div>
            </>
          )}

          {tab === 'hint' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Lightbulb size={18} /> Подсказка от ИИ-наставника
                </h3>
                {hintLevel && (
                  <span style={{
                    fontSize: 12,
                    background: 'var(--primary-light)',
                    color: 'var(--primary)',
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontWeight: 600,
                  }} title="Чем выше уровень, тем подробнее подсказка. Уровень растёт, если запросить ещё одну, не меняя код.">
                    Уровень {hintLevel}/2
                  </span>
                )}
              </div>
              {hintLoading ? (
                <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Генерирую подсказку...</div>
              ) : hint ? (
                <>
                  <div className="markdown" style={{ background: 'var(--primary-light)', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap' }}>
                    {hint}
                  </div>
                  {hintLevel < 2 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, fontStyle: 'italic' }}>
                      Если эта подсказка не помогла и вы не сдвинулись — запросите ещё одну, она будет конкретнее.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'var(--text-muted)' }}>
                  Нажмите кнопку подсказки справа, чтобы получить помощь от ИИ-наставника.
                </div>
              )}
            </div>
          )}

          {tab === 'results' && result && (
            <div>
              <div style={{
                padding: '12px 16px',
                borderRadius: 8,
                marginBottom: 20,
                background: result.status === 'accepted' ? 'var(--success-light)' : 'var(--error-light)',
                fontSize: 16,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }} className={`status-${result.status}`}>
                {STATUS_LABELS[result.status] || result.status}
                {result.points_earned > 0 && (
                  <span style={{ marginLeft: 12, fontSize: 14, color: '#16a34a' }}>
                    +{result.points_earned} {pointsWord(result.points_earned)}
                  </span>
                )}
              </div>

              {result.error_message && (
                <div style={{ background: '#1e293b', color: '#e2e8f0', padding: 16, borderRadius: 6, marginBottom: 16, fontFamily: 'monospace', fontSize: 13 }}>
                  {result.error_message}
                </div>
              )}

              {result.test_results.length > 0 && (
                <div>
                  <h4 style={{ marginBottom: 12 }}>Тест-кейсы:</h4>
                  {result.test_results.map(tr => (
                    <div key={tr.test} style={{
                      background: tr.passed ? 'var(--success-light)' : 'var(--error-light)',
                      border: `1px solid ${tr.passed ? '#86efac' : '#fca5a5'}`,
                      borderRadius: 6,
                      padding: '10px 14px',
                      marginBottom: 8,
                      fontSize: 13,
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {tr.passed ? <CheckCircle2 size={15} strokeWidth={2.4} /> : <XCircle size={15} />} Тест {tr.test}
                      </div>
                      {tr.input && <div><b>Ввод:</b> <code>{tr.input.trim()}</code></div>}
                      <div><b>Ожидалось:</b> <code>{tr.expected}</code></div>
                      {!tr.passed && <div><b>Получено:</b> <code>{tr.got || tr.error}</code></div>}
                    </div>
                  ))}
                </div>
              )}

              {result.status === 'accepted' && (
                <button className="btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={nextTask}>
                  Следующая задача →
                </button>
              )}
            </div>
          )}

          {tab === 'results' && !result && (
            <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>
              Отправьте решение, чтобы увидеть результат.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Code editor + I/O */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <div style={{ background: 'var(--white)', borderRadius: 8, overflow: 'hidden', flex: 1, boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{
            background: '#1e293b',
            color: '#94a3b8',
            padding: '8px 16px',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Cog size={14} /> C++
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={runCustom}
                disabled={runnerRunning}
                style={{
                  background: 'rgba(34,197,94,0.18)',
                  color: '#86efac',
                  padding: '3px 12px',
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
                title="Запустить программу со своим вводом"
              >
                {runnerRunning ? <Loader2 size={12} /> : <Play size={12} fill="currentColor" />}
                Запустить
              </button>
              <button
                onClick={() => setCode(DEFAULT_CODE)}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#94a3b8', padding: '3px 10px', fontSize: 12 }}
              >
                Сбросить
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Editor
              height="100%"
              defaultLanguage="cpp"
              value={code}
              onChange={v => setCode(v || '')}
              theme="vs-dark"
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                tabSize: 4,
              }}
            />
          </div>
        </div>

        {/* Ввод/вывод программы (своя песочница, тест-кейсы скрыты) */}
        <div style={{
          background: '#1e293b',
          borderRadius: 8,
          padding: '10px 14px',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{
            color: '#94a3b8', fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Terminal size={13} /> Ввод
          </div>
          <textarea
            value={runnerStdin}
            onChange={e => setRunnerStdin(e.target.value)}
            rows={2}
            style={{
              fontFamily: "'JetBrains Mono', 'Consolas', Monaco, monospace",
              fontSize: 13,
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #334155',
              resize: 'vertical',
              minHeight: 44,
              padding: '6px 10px',
            }}
          />

          {runnerResult && (
            <>
              <div style={{
                color: runnerResult.stderr && !runnerResult.stdout ? '#fca5a5' : '#94a3b8',
                fontSize: 12, fontWeight: 600, marginTop: 4,
              }}>
                Вывод
              </div>
              {runnerResult.stdout !== '' && (
                <pre style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  padding: '6px 10px',
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Consolas', Monaco, monospace",
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  maxHeight: 120,
                  overflow: 'auto',
                }}>{runnerResult.stdout}</pre>
              )}
              {runnerResult.stderr && (
                <pre style={{
                  background: '#450a0a',
                  color: '#fecaca',
                  border: '1px solid #7f1d1d',
                  padding: '6px 10px',
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Consolas', Monaco, monospace",
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                  maxHeight: 120,
                  overflow: 'auto',
                }}>{runnerResult.timed_out ? `Превышено время выполнения.\n${runnerResult.stderr}` : runnerResult.stderr}</pre>
              )}
              {runnerResult.stdout === '' && !runnerResult.stderr && (
                <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>
                  Программа ничего не вывела.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-secondary"
            style={{ flex: 1, padding: 12, opacity: canHint ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={handleHint}
            disabled={hintLoading || !canHint}
            title={
              canHint
                ? (nextHintCost > 0
                    ? `Подсказка уровня ${nextHintLevel} спишет ${nextHintCost} ${pointsWord(nextHintCost)}`
                    : `Подсказка уровня ${nextHintLevel} — бесплатно`)
                : `Недостаточно баллов (нужно ${nextHintCost})`
            }
          >
            <Lightbulb size={15} />
            {nextHintCost === 0 ? (
              <>Подсказка <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>(бесплатно)</span></>
            ) : (
              <>
                Подсказка <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>(−{nextHintCost}</span>
                <Star size={12} fill="#f59e0b" color="#f59e0b" style={{ marginLeft: 1 }} />
                <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>)</span>
              </>
            )}
          </button>
          <button
            className="btn-success"
            style={{ flex: 2, padding: 12, fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <><Loader2 size={15} /> Проверяем...</>
            ) : (
              <><Play size={15} fill="currentColor" /> Отправить решение</>
            )}
          </button>
        </div>

        {!canHint && (
          <div style={{ fontSize: 12, color: '#f97316', textAlign: 'center', marginTop: -6 }}>
            Недостаточно баллов для подсказки уровня {nextHintLevel}. Решайте задачи, чтобы заработать баллы.
          </div>
        )}
      </div>
    </div>
  )
}
