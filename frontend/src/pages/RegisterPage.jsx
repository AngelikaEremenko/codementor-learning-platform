import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Code2, Check, Circle } from 'lucide-react'
import api from '../api'

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

function PasswordChecklist({ pwd }) {
  const checks = checkPassword(pwd)
  const items = [
    { key: 'length', label: 'Не короче 8 символов' },
    { key: 'lower', label: 'Строчная латинская буква' },
    { key: 'upper', label: 'Заглавная латинская буква' },
    { key: 'digit', label: 'Цифра' },
    { key: 'special', label: 'Спецсимвол (!@#$%^&* и т.д.)' },
  ]
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', fontSize: 12 }}>
      {items.map(it => (
        <li key={it.key} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: checks[it.key] ? '#16a34a' : 'var(--text-muted)',
          marginBottom: 2,
        }}>
          <span style={{ width: 14, display: 'inline-flex', alignItems: 'center' }}>
            {checks[it.key] ? <Check size={12} strokeWidth={3} /> : <Circle size={11} />}
          </span>
          {it.label}
        </li>
      ))}
    </ul>
  )
}

function StrengthBar({ pwd }) {
  const checks = checkPassword(pwd)
  const score = Object.values(checks).filter(Boolean).length
  const colors = ['#dc2626', '#dc2626', '#f59e0b', '#f59e0b', '#16a34a', '#16a34a']
  const labels = ['—', 'Очень слабый', 'Слабый', 'Средний', 'Хороший', 'Отличный']
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < score ? colors[score] : '#e2e8f0',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: colors[score], marginTop: 4, fontWeight: 600 }}>
        {pwd ? labels[score] : ''}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const passwordValid = useMemo(() => {
    const c = checkPassword(form.password)
    return Object.values(c).every(Boolean)
  }, [form.password])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!passwordValid) {
      setError('Пароль не соответствует требованиям.')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/register/', form)
      // Автоматический вход после регистрации
      const res = await api.post('/auth/login/', { email: form.email, password: form.password })
      localStorage.setItem('access_token', res.data.access)
      localStorage.setItem('refresh_token', res.data.refresh)
      navigate('/')
    } catch (err) {
      const data = err.response?.data
      if (Array.isArray(data?.password)) setError(data.password.join(' '))
      else if (data?.email) setError('Email уже занят или некорректен.')
      else if (data?.username) setError('Имя пользователя уже занято.')
      else setError('Ошибка регистрации. Попробуйте снова.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      padding: 16,
    }}>
      <div className="card" style={{ width: 440, padding: 40, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--primary)' }}>
                <Code2 size={48} strokeWidth={2} />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>Регистрация</h1>
              <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Создайте аккаунт CodeMentor</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Имя пользователя</label>
                <input
                  placeholder="username"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Email</label>
                <input
                  type="email"
                  placeholder="example@mail.ru"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Пароль</label>
                <input
                  type="password"
                  placeholder="Придумайте пароль"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                />
                <StrengthBar pwd={form.password} />
                <PasswordChecklist pwd={form.password} />
              </div>

              {error && (
                <div style={{ background: 'var(--error-light)', color: 'var(--error)', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', padding: 12, opacity: passwordValid ? 1 : 0.6 }}
                disabled={loading || !passwordValid}
              >
                {loading ? 'Регистрация...' : 'Зарегистрироваться'}
              </button>
            </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-muted)' }}>
          Уже есть аккаунт?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}
