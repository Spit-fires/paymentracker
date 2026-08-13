import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppContext'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Login } from './pages/Login'
import { Lock } from './pages/Lock'
import { Dashboard } from './pages/Dashboard'
import { Students } from './pages/Students'
import { StudentDetail } from './pages/StudentDetail'
import { Payment } from './pages/Payment'
import { ReceiptView } from './pages/ReceiptView'
import { ReceiptLookup } from './pages/ReceiptLookup'
import { Settings } from './pages/Settings'
import { Accounting } from './pages/Accounting'
import { Spinner } from './components/ui'

function Splash() {
  return (
    <div className="min-h-screen bg-ink grid place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-white/10 grid place-items-center text-[38px] font-bold text-white">
          ৳
        </div>
        <Spinner className="w-6 h-6 text-white/70" />
        <div className="text-[12px] text-white/50 tracking-wide">Payment Tracker</div>
      </div>
    </div>
  )
}

function Gate() {
  const { initialized, user, locked } = useApp()
  if (!initialized) return <Splash />
  if (user && locked) return <Lock />
  if (!user) return <Login />
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/students" element={<Students />} />
          <Route path="/accounting" element={<Accounting />} />
          <Route path="/student/:id" element={<StudentDetail />} />
          <Route path="/payment/:id" element={<Payment />} />
          <Route path="/receipt/lookup" element={<ReceiptLookup />} />
          <Route path="/receipt/:id" element={<ReceiptView />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AppProvider>
  )
}
