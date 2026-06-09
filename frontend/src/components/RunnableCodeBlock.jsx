import { useState, useCallback, useEffect, useMemo } from 'react'
import Editor from '@monaco-editor/react'
import api from '../api'

/**
 * Интерактивный блок кода C++.
 * Рендерится вместо обычного ```cpp-run в теории.
 * Ученик может изменить код, при необходимости ввести данные для cin
 * и запустить программу прямо на странице.
 *
 * Если в коде есть `cin`, автоматически появляется поле ввода данных.
 * Можно задать стартовое значение через комментарий `// stdin: ...`
 * в самом начале кода — он будет вырезан и подставлен в поле ввода.
 */
export default function RunnableCodeBlock({ initialCode, taskHint }) {
  // Извлекаем `// stdin: ...` из начала кода
  const { cleanCode, defaultStdin } = useMemo(() => {
    const m = /^[ \t]*\/\/\s*stdin:[ \t]*(.*?)\r?\n/i.exec(initialCode)
    if (!m) return { cleanCode: initialCode, defaultStdin: '' }
    // Запятые-разделители превращаем в переводы строки — удобный способ задать
    // несколько значений в одной строке: `// stdin: 5, 7`.
    const value = m[1].replace(/,\s*/g, '\n')
    return {
      cleanCode: initialCode.slice(m[0].length),
      defaultStdin: value,
    }
  }, [initialCode])

  const needsInput = /\bcin\b|getline\b/.test(cleanCode)

  const [code, setCode] = useState(cleanCode)
  const [stdin, setStdin] = useState(defaultStdin)
  const [output, setOutput] = useState(null)
  const [running, setRunning] = useState(false)

  // Высота редактора подстраивается под количество строк кода.
  // Каждая строка ≈ 19px при fontSize 14, плюс внутренние отступы редактора
  // (12px сверху + 12px снизу) и небольшой запас.
  const editorHeight = useMemo(() => {
    const lineCount = (code.match(/\n/g) || []).length + 1
    const calculated = lineCount * 19 + 32
    return Math.min(Math.max(calculated, 100), 440)
  }, [code])

  useEffect(() => {
    setCode(cleanCode)
    setStdin(defaultStdin)
    setOutput(null)
  }, [cleanCode, defaultStdin])

  const run = useCallback(async () => {
    setRunning(true)
    setOutput(null)
    try {
      const res = await api.post('/run-code/', { code, stdin })
      setOutput(res.data)
    } catch {
      setOutput({ stdout: '', stderr: 'Ошибка связи с сервером.', timed_out: false })
    } finally {
      setRunning(false)
    }
  }, [code, stdin])

  const reset = useCallback(() => {
    setCode(cleanCode)
    setStdin(defaultStdin)
    setOutput(null)
  }, [cleanCode, defaultStdin])

  const hasError = output && (output.stderr || output.timed_out)

  return (
    <div style={{
      border: '1.5px solid #e2e8f0',
      borderRadius: 10,
      overflow: 'hidden',
      margin: '20px 0',
      background: '#ffffff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      {/* Заголовок */}
      <div style={{
        background: '#1e1e2e',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#7c7f9e', fontFamily: 'monospace' }}>C++</span>
          {taskHint && (
            <span style={{ fontSize: 12, color: '#a6e3a1', background: '#1e3a2e', borderRadius: 4, padding: '2px 8px' }}>
              {taskHint}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={reset}
            title="Сбросить до исходного кода"
            style={{
              background: 'transparent',
              border: '1px solid #45475a',
              color: '#7c7f9e',
              fontSize: 12,
              padding: '3px 10px',
              borderRadius: 5,
              cursor: 'pointer',
            }}
          >
            Сбросить
          </button>
          <button
            onClick={run}
            disabled={running}
            style={{
              background: running ? '#45475a' : '#89b4fa',
              color: '#1e1e2e',
              fontWeight: 700,
              fontSize: 13,
              padding: '4px 16px',
              borderRadius: 5,
              cursor: running ? 'not-allowed' : 'pointer',
              border: 'none',
              transition: 'background 0.2s',
            }}
          >
            {running ? '...' : '▶ Запустить'}
          </button>
        </div>
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
          wordWrap: 'on',
          tabSize: 4,
          padding: { top: 12, bottom: 12 },
        }}
      />

      {/* Поле ввода для cin — появляется только если в коде есть cin/getline */}
      {needsInput && (
        <div style={{
          background: '#26273a',
          borderTop: '1px solid #313244',
        }}>
          <div style={{
            padding: '6px 16px',
            fontSize: 11,
            fontFamily: 'sans-serif',
            color: '#7c7f9e',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>Ввод данных</span>
            <span style={{ textTransform: 'none', fontSize: 10, color: '#5b5d72' }}>
              каждое значение пишите на отдельной строке
            </span>
          </div>
          <textarea
            value={stdin}
            onChange={e => setStdin(e.target.value)}
            rows={Math.max(1, stdin.split('\n').length)}
            placeholder="Введите данные, которые программа прочитает через cin"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e2e8f0',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: 13,
              resize: 'vertical',
            }}
          />
        </div>
      )}

      {/* Вывод */}
      {output !== null && (
        <div style={{
          background: hasError ? '#2d1b1b' : '#1a2a1a',
          borderTop: `1px solid ${hasError ? '#5a2d2d' : '#2d5a2d'}`,
        }}>
          <div style={{
            padding: '6px 16px',
            borderBottom: `1px solid ${hasError ? '#3a1f1f' : '#1f3a1f'}`,
            fontSize: 11,
            fontFamily: 'sans-serif',
            color: '#7c7f9e',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {hasError ? 'Ошибка' : 'Вывод программы'}
          </div>
          <pre style={{
            margin: 0,
            padding: '10px 16px',
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            maxHeight: 180,
            overflowY: 'auto',
            color: hasError ? '#f38ba8' : '#a6e3a1',
            background: 'transparent',
            border: 'none',
          }}>
            {output.timed_out
              ? 'Превышено время выполнения (10 сек).'
              : (hasError ? output.stderr : (output.stdout || '(нет вывода)'))}
          </pre>
        </div>
      )}
    </div>
  )
}
