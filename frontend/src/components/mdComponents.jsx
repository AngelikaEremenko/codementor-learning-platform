/**
 * Общие компоненты-рендереры для ReactMarkdown.
 * Используются в теории и в описаниях мини-заданий, чтобы код во всех местах
 * выглядел одинаково: акцентный инлайн `code` и тёмные pre-блоки.
 */
export const mdComponents = {
  code({ className, children }) {
    const isBlock = /language-\w+/.test(className || '')
    if (isBlock) {
      return (
        <pre style={{
          background: '#0f172a', color: '#e2e8f0',
          borderRadius: 'var(--radius)', padding: '14px 18px',
          overflowX: 'auto', margin: '12px 0', fontSize: 13,
          lineHeight: 1.6, whiteSpace: 'pre',
        }}>
          <code style={{ fontFamily: "'JetBrains Mono', 'Consolas', Monaco, monospace" }}>
            {children}
          </code>
        </pre>
      )
    }
    return (
      <code style={{
        background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
        padding: '1px 6px', fontFamily: "'JetBrains Mono', 'Consolas', Monaco, monospace",
        fontSize: '0.9em', color: 'var(--primary-dark)',
      }}>
        {children}
      </code>
    )
  },
  pre({ children }) {
    return <>{children}</>
  },
}
