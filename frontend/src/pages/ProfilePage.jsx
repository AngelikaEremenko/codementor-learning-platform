import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Check, BookOpen, GraduationCap, CheckCircle2, Circle, Camera, Trash2 } from 'lucide-react'
import api from '../api'
import { useUser } from '../components/Layout'

const SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{};:'",.<>?/\\|`~]/

function checkPassword(pwd) {
  return {
    length: pwd.length >= 8,
    lower: /[a-z]/.test(pwd),
    upper: /[A-Z]/.test(pwd),
    digit: /\d/.test(pwd),
    special: SPECIAL_RE.test(pwd),
  }
}

function fmtDate(isoStr) {
  if (!isoStr) return '—'
  try {
    return new Date(isoStr).toLocaleDateString('ru-RU', {
      year: 'numeric', month: 'long', day: 'numeric',
    })
  } catch { return isoStr }
}

export default function ProfilePage() {
  const { user, refreshUser } = useUser()
  const [stats, setStats] = useState(null)
  const [tagStats, setTagStats] = useState(null)
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState('')
  const [savingUsername, setSavingUsername] = useState(false)
  const [usernameMsg, setUsernameMsg] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarMsg, setAvatarMsg] = useState('')
  const fileInputRef = useRef(null)

  // Смена пароля
  const [pwOpen, setPwOpen] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '' })
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' })
  const [pwLoading, setPwLoading] = useState(false)

  const newPwValid = useMemo(() => {
    const c = checkPassword(pwForm.next)
    return Object.values(c).every(Boolean)
  }, [pwForm.next])

  useEffect(() => {
    if (user?.username) setUsername(user.username)
  }, [user?.username])

  useEffect(() => {
    api.get('/auth/profile/stats/').then(r => setStats(r.data)).catch(() => {})
    api.get('/auth/profile/tag-stats/').then(r => setTagStats(r.data)).catch(() => {})
  }, [])

  async function saveUsername() {
    setUsernameMsg('')
    setSavingUsername(true)
    try {
      await api.patch('/auth/profile/', { username })
      await refreshUser()
      setEditing(false)
      setUsernameMsg('Имя обновлено.')
      setTimeout(() => setUsernameMsg(''), 3000)
    } catch (err) {
      const data = err.response?.data
      setUsernameMsg(data?.username?.[0] || 'Не удалось сохранить.')
    } finally {
      setSavingUsername(false)
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setAvatarMsg('Файл слишком большой (макс. 2 МБ).')
      setTimeout(() => setAvatarMsg(''), 4000)
      return
    }
    setAvatarMsg('')
    setAvatarUploading(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      await api.post('/auth/profile/avatar/', fd)
      await refreshUser()
    } catch {
      setAvatarMsg('Не удалось загрузить аватар.')
      setTimeout(() => setAvatarMsg(''), 4000)
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleAvatarRemove() {
    if (!user.avatar) return
    setAvatarUploading(true)
    try {
      await api.delete('/auth/profile/avatar/')
      await refreshUser()
    } catch {
      setAvatarMsg('Не удалось удалить аватар.')
      setTimeout(() => setAvatarMsg(''), 4000)
    } finally {
      setAvatarUploading(false)
    }
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwMsg({ type: '', text: '' })
    if (!newPwValid) {
      setPwMsg({ type: 'error', text: 'Новый пароль не соответствует требованиям.' })
      return
    }
    setPwLoading(true)
    try {
      await api.post('/auth/change-password/', {
        current_password: pwForm.current,
        new_password: pwForm.next,
      })
      setPwMsg({ type: 'ok', text: 'Пароль успешно изменён.' })
      setPwForm({ current: '', next: '' })
      setTimeout(() => { setPwOpen(false); setPwMsg({ type: '', text: '' }) }, 2000)
    } catch (err) {
      const data = err.response?.data
      const text = data?.current_password?.[0]
        || (Array.isArray(data?.new_password) && data.new_password.join(' '))
        || 'Не удалось изменить пароль.'
      setPwMsg({ type: 'error', text })
    } finally {
      setPwLoading(false)
    }
  }

  if (!user) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Загрузка...</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Профиль</h1>

      {/* Карточка пользователя */}
      <div className="card" style={{ padding: 24, marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            title="Загрузить новый аватар"
            style={{
              width: 88, height: 88, borderRadius: 'var(--radius-full)',
              background: user.avatar ? 'transparent' : 'var(--primary)',
              padding: 0, border: 'none',
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 34, fontWeight: 700,
              cursor: avatarUploading ? 'wait' : 'pointer',
              position: 'relative',
            }}
          >
            {user.avatar ? (
              <img
                src={user.avatar}
                alt="Аватар"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              user.username?.[0]?.toUpperCase() || '?'
            )}
            <span style={{
              position: 'absolute', inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0'}
            >
              <Camera size={22} color="white" />
            </span>
          </button>
          {user.avatar && (
            <button
              type="button"
              onClick={handleAvatarRemove}
              disabled={avatarUploading}
              title="Удалить аватар"
              style={{
                position: 'absolute', top: -4, right: -4,
                width: 26, height: 26, borderRadius: 'var(--radius-full)',
                background: 'var(--white)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-sm)',
                cursor: 'pointer',
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{ flex: 1, padding: '6px 10px' }}
              />
              <button
                onClick={saveUsername}
                className="btn-primary"
                disabled={savingUsername}
                style={{ padding: '6px 14px', fontSize: 13 }}
              >
                Сохранить
              </button>
              <button
                onClick={() => { setEditing(false); setUsername(user.username) }}
                style={{ background: '#e2e8f0', color: '#1e293b', padding: '6px 14px', fontSize: 13 }}
              >
                Отмена
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{user.username}</h2>
              <button
                onClick={() => setEditing(true)}
                title="Изменить имя"
                style={{ background: 'transparent', color: 'var(--primary)', padding: '2px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Pencil size={12} /> Изменить
              </button>
            </div>
          )}
          {usernameMsg && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{usernameMsg}</div>}
          {avatarMsg && <div style={{ fontSize: 12, color: 'var(--error)' }}>{avatarMsg}</div>}
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{user.email}</div>
          {user.is_staff && (
            <span style={{
              display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 700,
              background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: 'var(--radius-full)',
            }}>
              АДМИН
            </span>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard
          icon={<BookOpen size={22} />}
          label="Изучено теорий"
          value={stats ? `${stats.theories_completed} / ${stats.theories_total}` : '—'}
        />
        <StatCard
          icon={<Check size={22} strokeWidth={2.5} />}
          label="Освоено задач"
          value={stats ? `${stats.mastered_tasks} / ${stats.main_tasks_total}` : '—'}
        />
        <StatCard
          icon={<GraduationCap size={22} />}
          label="Пройдено модулей"
          value={stats ? `${stats.modules_completed} / ${stats.modules_total}` : '—'}
        />
      </div>

      {/* Информация */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Информация</h3>
        <Row label="Дата регистрации" value={fmtDate(user.registered_at)} />
        <Row
          label="Email"
          value={
            <>
              {user.email}{' '}
              {user.email_verified ? (
                <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={14} /> подтверждён
                </span>
              ) : (
                <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: 12 }}>не подтверждён</span>
              )}
            </>
          }
        />
      </div>

      {/* Пароль */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pwOpen ? 14 : 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Пароль</h3>
          <button
            onClick={() => setPwOpen(o => !o)}
            style={{ background: 'transparent', color: 'var(--primary)', fontSize: 13 }}
          >
            {pwOpen ? 'Скрыть' : 'Сменить пароль'}
          </button>
        </div>
        {pwOpen && (
          <form onSubmit={changePassword}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                Текущий пароль
              </label>
              <input
                type="password"
                value={pwForm.current}
                onChange={e => setPwForm({ ...pwForm, current: e.target.value })}
                required
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>
                Новый пароль
              </label>
              <input
                type="password"
                value={pwForm.next}
                onChange={e => setPwForm({ ...pwForm, next: e.target.value })}
                required
              />
              <PasswordChecklist pwd={pwForm.next} />
            </div>
            {pwMsg.text && (
              <div style={{
                padding: '8px 12px', borderRadius: 6, fontSize: 13,
                background: pwMsg.type === 'ok' ? '#dcfce7' : 'var(--error-light)',
                color: pwMsg.type === 'ok' ? '#15803d' : 'var(--error)',
                marginBottom: 12,
              }}>
                {pwMsg.text}
              </div>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={pwLoading || !newPwValid}
              style={{ padding: '8px 22px', opacity: newPwValid ? 1 : 0.6 }}
            >
              {pwLoading ? 'Сохраняем...' : 'Изменить пароль'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }) {
  return (
    <div className="card" style={{ padding: 16, textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color: 'var(--primary)' }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 14 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function TagPill({ data, color, bg }) {
  const remaining = (data.tasks_total_in_course || 0) - data.tasks_solved
  return (
    <span
      title={
        `Решено задач этой темы: ${data.tasks_solved} из ${data.tasks_tried} попробованных ` +
        `(${data.completion_rate} %). Всего в курсе задач этой темы: ${data.tasks_total_in_course}.`
      }
      style={{
        background: bg,
        color,
        borderRadius: 14,
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {data.name}
      <span style={{ fontWeight: 500, opacity: 0.85 }}>
        решено {data.tasks_solved} из {data.tasks_tried} ({data.completion_rate} %)
        {remaining > 0 && `, осталось ${remaining}`}
      </span>
    </span>
  )
}

function PasswordChecklist({ pwd }) {
  const checks = checkPassword(pwd)
  const items = [
    ['length', 'Не короче 8 символов'],
    ['lower', 'Строчная латинская буква'],
    ['upper', 'Заглавная латинская буква'],
    ['digit', 'Цифра'],
    ['special', 'Спецсимвол'],
  ]
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', fontSize: 12 }}>
      {items.map(([key, label]) => (
        <li key={key} style={{
          color: checks[key] ? '#16a34a' : 'var(--text-muted)',
          marginBottom: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          {checks[key] ? <Check size={12} strokeWidth={3} /> : <Circle size={11} />} {label}
        </li>
      ))}
    </ul>
  )
}
