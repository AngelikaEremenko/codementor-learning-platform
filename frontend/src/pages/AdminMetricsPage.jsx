import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import api from '../api'
import { useUser } from '../components/Layout'

const DIFFICULTY_LABEL = { 1: 'Базовый', 2: 'Средний', 3: 'Продвинутый' }
const DIFFICULTY_COLOR = { 1: '#fca5a5', 2: '#fde047', 3: '#86efac' }

function fmtPercent(v) {
  return v == null ? '—' : `${v}%`
}

function fmtMinutes(sec) {
  if (sec == null || sec === 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m} мин ${s} с` : `${s} с`
}

function StatCard({ label, value, hint, color = 'var(--primary)' }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginTop: 6, lineHeight: 1 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{hint}</div>}
    </div>
  )
}

function HintEffectBlock({ hint }) {
  const w = hint.with_hint_rate ?? 0
  const wo = hint.without_hint_rate ?? 0
  const delta = (w - wo).toFixed(1)
  const helps = parseFloat(delta) > 0

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
        Помогают ли подсказки ИИ-наставника?
      </h3>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
        Сравниваются доли успешных решений с подсказкой и без неё.
      </div>

      <ProgressLine
        label="Когда ученик попросил подсказку у ИИ"
        pct={w}
        accepted={hint.with_hint_accepted}
        total={hint.with_hint_total}
        color="#16a34a"
      />
      <ProgressLine
        label="Когда ученик решал самостоятельно"
        pct={wo}
        accepted={hint.without_hint_accepted}
        total={hint.without_hint_total}
        color="#64748b"
      />

      <div style={{
        marginTop: 16, padding: '12px 16px', borderRadius: 8,
        background: helps ? '#dcfce7' : '#fef3c7',
        color: helps ? '#15803d' : '#92400e',
        fontWeight: 600, fontSize: 14,
      }}>
        {helps
          ? `Подсказки помогают, успешных решений на ${delta} % больше.`
          : `Подсказки не дают прироста (разница ${Math.abs(delta)} %).`}
      </div>

      {hint.levels_distribution?.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            Число запросов подсказки по уровням
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {hint.levels_distribution.map(l => (
              <div key={l.level} style={{
                flex: 1, padding: '10px 12px', borderRadius: 8,
                background: '#f1f5f9', textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Уровень {l.level}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{l.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressLine({ label, pct, accepted, total, color }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          <b style={{ color }}>{pct} %</b>
          &nbsp;&nbsp;(решили {accepted} из {total})
        </span>
      </div>
      <div style={{ height: 12, background: '#e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function HardestTasksBlock({ tasks }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
        Задачи с низкой успешностью
      </h3>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
        Задачи с наименьшей долей успешных решений. Низкий процент успешности может
        указывать на необходимость переформулировать условие или добавить наводящую теорию.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <Th>Задача</Th>
            <Th>Модуль</Th>
            <Th right>Сложность</Th>
            <Th right>Всего попыток</Th>
            <Th right>Решили правильно</Th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.id} style={{ borderTop: '1px solid #e2e8f0' }}>
              <Td><div style={{ fontWeight: 600 }}>{t.title}</div></Td>
              <Td><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.module}</span></Td>
              <Td right>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: DIFFICULTY_COLOR[t.difficulty], color: '#1e293b',
                }}>
                  {DIFFICULTY_LABEL[t.difficulty]}
                </span>
              </Td>
              <Td right>{t.total_attempts}</Td>
              <Td right>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{
                    fontWeight: 700,
                    color: t.acceptance_rate < 50 ? '#dc2626'
                      : t.acceptance_rate < 75 ? '#f59e0b' : '#16a34a',
                  }}>
                    {t.acceptance_rate} %
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    успешных попыток {t.accepted} из {t.total_attempts}
                  </span>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, right }) {
  return <th style={{ padding: '10px 12px', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textAlign: right ? 'right' : 'left' }}>{children}</th>
}

function Td({ children, right }) {
  return <td style={{ padding: '10px 12px', verticalAlign: 'middle', textAlign: right ? 'right' : 'left' }}>{children}</td>
}

export default function AdminMetricsPage() {
  const { user } = useUser()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/auth/admin/metrics/')
      .then(r => { setData(r.data); setLoading(false) })
      .catch(err => { setError(err.response?.status === 403 ? 'Доступ только для администраторов' : 'Ошибка загрузки'); setLoading(false) })
  }, [])

  if (user && !user.is_staff) return <Navigate to="/" replace />

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Загружаем данные...</div>
  if (error) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--error)' }}>{error}</div>
  if (!data) return null

  const { users, submissions, hint_effect, hardest_tasks } = data

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>Панель администратора</h1>
      </div>

      {/* Общая сводка */}
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Общая сводка
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard
          label="Учеников всего"
          value={users.total}
          hint={`активных за последнюю неделю ${users.active_7d}`}
        />
        <StatCard
          label="Всего попыток решения"
          value={submissions.total}
          hint={`успешных из них ${submissions.accepted}`}
        />
        <StatCard
          label="Доля успешных попыток"
          value={fmtPercent(submissions.acceptance_rate)}
          hint="отношение попыток, прошедших все тесты, к общему числу попыток"
          color="#16a34a"
        />
        <StatCard
          label="Попыток на одну решённую задачу"
          value={submissions.avg_attempts_per_solved_task}
          hint="среднее число попыток ученика до успешного решения задачи"
        />
        <StatCard
          label="Среднее время одной попытки"
          value={fmtMinutes(submissions.avg_time_sec)}
          hint="от открытия задачи до отправки решения"
        />
      </div>

      {/* Эффект подсказок — главное визуальное доказательство */}
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Польза ИИ-наставника
      </h2>
      <div style={{ marginBottom: 28 }}>
        <HintEffectBlock hint={hint_effect} />
      </div>

      {/* Трудные задачи */}
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Проблемные задачи
      </h2>
      <div style={{ marginBottom: 20 }}>
        <HardestTasksBlock tasks={hardest_tasks} />
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
        Данные обновлены: {new Date(data.generated_at).toLocaleString('ru-RU')}
      </div>
    </div>
  )
}
