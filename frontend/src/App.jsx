import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import ModulePage from './pages/ModulePage'
import TaskPage from './pages/TaskPage'
import ProfilePage from './pages/ProfilePage'
import RulesPage from './pages/RulesPage'
import AdminMetricsPage from './pages/AdminMetricsPage'
import Layout from './components/Layout'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('access_token')
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="admin-stats" element={<AdminMetricsPage />} />
        <Route path="modules/:moduleId" element={<ModulePage />} />
        <Route path="modules/:moduleId/tasks/:taskId" element={<TaskPage />} />
      </Route>
    </Routes>
  )
}
