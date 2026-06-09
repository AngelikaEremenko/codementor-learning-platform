import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import api from '../api'

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div style={{ background: 'var(--border)', borderRadius: 'var(--radius-sm)', height: 6, marginTop: 10 }}>
      <div style={{
        width: `${pct}%`, background: 'var(--primary)',
        height: '100%', borderRadius: 'var(--radius-sm)', transition: 'width 0.3s',
      }} />
    </div>
  )
}

function ProgressRow({ label, done, total }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      fontSize: 12, color: 'var(--text-muted)', marginTop: 4,
    }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{done} / {total}</span>
    </div>
  )
}

export default function DashboardPage() {
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/modules/').then(r => {
      setModules(r.data)
      setLoading(false)
    })
  }, [])

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Загрузка...</div>

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Курс «Алгоритмы и структуры данных»</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
        {modules.map((mod, idx) => {
          const isLocked = mod.module_unlocked === false
          const theoriesDone = mod.theories_completed || 0
          const theoriesTotal = mod.theories_total || 0
          const tasksDone = mod.mastered_main_count || 0
          const tasksTotal = mod.main_task_count || 0
          const totalDone = theoriesDone + tasksDone
          const totalMax = theoriesTotal + tasksTotal
          const inProgress = totalDone > 0

          return (
            <div key={mod.id} className="card" style={{
              borderLeft: `4px solid var(--primary)`,
              padding: '20px 24px',
              opacity: isLocked ? 0.6 : 1,
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius)',
                  background: 'var(--primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700, color: 'var(--primary)',
                }}>
                  {idx + 1}
                </div>
              </div>

              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{mod.title}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                {mod.description}
              </p>

              <div style={{ marginTop: 'auto' }}>
                <ProgressRow label="Изучено теорий" done={theoriesDone} total={theoriesTotal} />
                <ProgressRow label="Освоено задач" done={tasksDone} total={tasksTotal} />
                <ProgressBar value={totalDone} max={totalMax} />

                <div style={{ marginTop: 16 }}>
                  {isLocked ? (
                    <div style={{
                      fontSize: 13, color: 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                    }}>
                      <Lock size={13} /> Сначала пройдите предыдущий модуль
                    </div>
                  ) : (
                    <Link to={`/modules/${mod.id}`}>
                      <button className="btn-primary" style={{ width: '100%' }}>
                        {inProgress ? 'Продолжить' : 'Начать'}
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
