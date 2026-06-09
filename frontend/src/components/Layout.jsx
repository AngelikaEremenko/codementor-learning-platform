import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState, createContext, useContext } from 'react'
import { Code2, BarChart3, Star } from 'lucide-react'
import api from '../api'
import { points as pointsWord } from '../utils/plural'

export const UserContext = createContext(null)

export function useUser() {
  return useContext(UserContext)
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)

  function refreshUser() {
    api.get('/auth/me/').then(r => setUser(r.data)).catch(() => {})
  }

  useEffect(() => {
    refreshUser()
  }, [])

  function logout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    navigate('/login')
  }

  return (
    <UserContext.Provider value={{ user, setUser, refreshUser }}>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header style={{
          background: 'var(--primary)',
          color: 'white',
          padding: '0 24px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Code2 size={22} strokeWidth={2.2} />
            <span style={{ fontSize: 20, fontWeight: 700 }}>CodeMentor</span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {user?.is_staff && (
              <Link to="/admin-stats" style={{
                color: location.pathname === '/admin-stats' ? 'white' : 'rgba(255,255,255,0.85)',
                fontWeight: location.pathname === '/admin-stats' ? 700 : 500,
                fontSize: 14,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <BarChart3 size={15} />
                Метрики
              </Link>
            )}
            {user && (
              <>
                <Link
                  to="/rules"
                  title="Как работают баллы и подсказки"
                  style={{
                    background: 'var(--white)',
                    borderRadius: 'var(--radius-full)',
                    padding: '4px 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                    border: location.pathname === '/rules' ? '2px solid white' : '2px solid transparent',
                  }}
                >
                  <Star size={14} fill="#f59e0b" color="#f59e0b" /> {user.points} {pointsWord(user.points)}
                </Link>
                <Link
                  to="/profile"
                  title={user.username}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.username}
                      style={{
                        width: 32, height: 32, borderRadius: 'var(--radius-full)',
                        objectFit: 'cover',
                        border: location.pathname === '/profile'
                          ? '2px solid white'
                          : '2px solid rgba(255,255,255,0.55)',
                        transition: 'border-color 0.15s',
                      }}
                    />
                  ) : (
                    <span style={{
                      width: 32, height: 32, borderRadius: 'var(--radius-full)',
                      background: location.pathname === '/profile' ? 'white' : 'rgba(255,255,255,0.25)',
                      color: location.pathname === '/profile' ? 'var(--primary)' : 'white',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700,
                      transition: 'background 0.15s, color 0.15s',
                    }}>
                      {user.username?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </Link>
              </>
            )}
            <button
              onClick={logout}
              title="Выйти из учётной записи"
              style={{
                background: 'transparent',
                color: 'white',
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                border: '1.5px solid rgba(255,255,255,0.55)',
                borderRadius: 'var(--radius)',
              }}
            >
              Выйти
            </button>
          </nav>
        </header>
        <main style={{ flex: 1, padding: '32px 24px', maxWidth: 1100, width: '100%', margin: '0 auto' }}>
          <Outlet />
        </main>
      </div>
    </UserContext.Provider>
  )
}
