import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Code2 } from 'lucide-react'
import api from '../api'

export default function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login/', form)
      localStorage.setItem('access_token', res.data.access)
      localStorage.setItem('refresh_token', res.data.refresh)
      navigate('/')
    } catch {
      setError('Неверный email или пароль')
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
      <div className="card" style={{ width: 400, padding: 40, boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, color: 'var(--primary)' }}>
            <Code2 size={48} strokeWidth={2} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>CodeMentor</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Адаптивная система обучения</p>
        </div>

        <form onSubmit={handleSubmit}>
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
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>Пароль</label>
            <input
              type="password"
              placeholder="Введите пароль"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          {error && (
            <div style={{ background: 'var(--error-light)', color: 'var(--error)', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: 12 }} disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--text-muted)' }}>
          Нет аккаунта?{' '}
          <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  )
}
