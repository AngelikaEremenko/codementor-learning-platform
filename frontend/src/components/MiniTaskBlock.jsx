import { useState, useCallback, useMemo } from 'react'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Wrench, Lightbulb, AlertTriangle, XCircle, Play } from 'lucide-react'
import api from '../api'
import { useUser } from './Layout'
import { points as pointsWord } from '../utils/plural'

/**
 * Мини-задание внутри теории. Студент пишет код, нажимает "Проверить",
 * сервер прогоняет его через тест-кейсы и возвращает passed/failed.
 *
 * При успехе: meta.onPass(miniId) — родительский компонент обновит UI прогресса.
 */
export default function MiniTaskBlock({ task, alreadyPassed = false, onPass }) {
  const { refreshUser } = useUser()
  const [code, setCode] = useState(task.starter_code || DEFAULT_STARTER)
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [passed, setPassed] = useState(alreadyPassed)

  const check = useCallback(async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await api.post(`/mini-tasks/${task.id}/check/`, { code })
      setResult(res.data)
      if (res.data.passed && !passed) {
        setPassed(true)
        if (onPass) onPass(task.id)
      }
      if (res.data.points_earned > 0) {
        refreshUser()
      }
    } catch (err) {
      setResult({
        status: 'error',
        passed: false,
        error_message: err.response?.data?.detail || 'Ошибка связи с сервером.',
        test_results: [],
      })
    } finally {
      setRunning(false)
    }
  }, [code, task.id, passed, onPass, refreshUser])

  const reset = useCallback(() => {
    setCode(task.starter_code || DEFAULT_STARTER)
    setResult(null)
  }, [task.starter_code])

  const failedTests = result?.test_results?.filter(r => !r.passed) || []

  // Высота редактора подстраивается под количество строк кода.
  // Каждая строка ≈ 19px при fontSize 14, плюс внутренние отступы редактора
  // (12px сверху + 12px снизу) и небольшой запас.
  const editorHeight = useMemo(() => {
    const lineCount = (code.match(/\n/g) || []).length + 1
    const calculated = lineCount * 19 + 32
    return Math.min(Math.max(calculated, 100), 440)
  }, [code])

  return (
    <div style={{
      border: passed ? '2px solid #16a34a' : '2px solid #f59e0b',
      borderRadius: 12,
      overflow: 'hidden',
      margin: '24px 0',
      background: '#ffffff',
      boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
    }}>
      {/* Заголовок */}
      <div style={{
        background: passed ? '#dcfce7' : '#fef3c7',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            background: passed ? '#16a34a' : '#f59e0b',
            color: 'white',
            padding: '3px 10px',
            borderRadius: 12,
            letterSpacing: '0.05em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}>
            {passed ? (
              <><Check size={12} strokeWidth={3} /> СДАНО</>
            ) : (
              <><Wrench size={12} /> ПРАКТИКА</>
            )}
          </span>
          <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>
            {task.title}
          </span>
        </div>
      </div>

      {/* Условие */}
      <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9' }} className="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
      </div>

      {/* Редактор */}
      <Editor
        height={`${editorHeight}px`}
        language="cpp"
        theme="vs-dark"
        value={code}
        onChange={v => setCode(v || '')}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          tabSize: 4,
          padding: { top: 12, bottom: 12 },
        }}
      />

      {/* Кнопки */}
      <div style={{
        background: '#f8fafc',
        padding: '10px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: '1px solid #e2e8f0',
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={reset}
            style={{
              background: 'transparent',
              border: '1px solid #cbd5e1',
              color: '#64748b',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Сбросить
          </button>
          {task.hint && (
            <button
              onClick={() => setShowHint(s => !s)}
              style={{
                background: 'transparent',
                border: '1px solid #cbd5e1',
                color: '#64748b',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Lightbulb size={14} /> {showHint ? 'Скрыть подсказку' : 'Подсказка'}
            </button>
          )}
        </div>
        <button
          onClick={check}
          disabled={running}
          style={{
            background: running ? '#94a3b8' : 'var(--primary)',
            color: 'white',
            border: 'none',
            padding: '8px 22px',
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 14,
            cursor: running ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {running ? 'Проверяю...' : (<><Play size={13} fill="currentColor" /> Проверить</>)}
        </button>
      </div>

      {/* Подсказка */}
      {showHint && task.hint && (
        <div style={{
          background: '#fffbeb',
          padding: '12px 18px',
          borderTop: '1px solid #fde68a',
          fontSize: 14,
          color: '#92400e',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}>
          <Lightbulb size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{task.hint}</span>
        </div>
      )}

      {/* Результат */}
      {result && (
        <div style={{
          background: result.passed ? '#f0fdf4' : '#fef2f2',
          borderTop: `1px solid ${result.passed ? '#86efac' : '#fca5a5'}`,
          padding: '14px 18px',
          fontSize: 13,
        }}>
          {result.passed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ color: '#15803d', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Check size={16} strokeWidth={2.8} /> Все тесты пройдены! Можно идти дальше.
              </div>
              {result.points_earned > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  alignSelf: 'flex-start',
                  background: 'var(--white)',
                  border: '1px solid var(--success)',
                  color: 'var(--success)',
                  fontWeight: 700, fontSize: 13,
                  padding: '4px 12px', borderRadius: 'var(--radius-full)',
                }}>
                  +{result.points_earned} {pointsWord(result.points_earned)} за прохождение теории
                </div>
              )}
            </div>
          ) : (
            <>
              <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {result.status === 'error' ? (
                  <><AlertTriangle size={15} /> Ошибка компиляции/выполнения</>
                ) : (
                  <><XCircle size={15} /> Не все тесты пройдены</>
                )}
              </div>
              {result.error_message && (
                <pre style={{
                  background: '#1e293b', color: '#e2e8f0',
                  padding: 10, borderRadius: 6,
                  fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap',
                  margin: '6px 0',
                }}>
                  {result.error_message}
                </pre>
              )}
              {failedTests.slice(0, 2).map(t => (
                <div key={t.test} style={{
                  background: 'white',
                  border: '1px solid #fca5a5',
                  borderRadius: 6,
                  padding: '8px 12px',
                  marginTop: 6,
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}>
                  <div><b>Тест {t.test}:</b></div>
                  {t.input && <div>Ввод: <code>{t.input.trim()}</code></div>}
                  <div>Ожидалось: <code>{t.expected}</code></div>
                  <div>Получено: <code>{t.got || '(нет)'}</code></div>
                </div>
              ))}
              {failedTests.length > 2 && (
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>
                  …и ещё {failedTests.length - 2} тест(ов) не прошли.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

const DEFAULT_STARTER = `#include <iostream>
using namespace std;

int main() {
    // Ваш код здесь

    return 0;
}
`
