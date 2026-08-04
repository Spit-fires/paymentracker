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
import { Spinner } from './components/ui'

function Splash() {
  return (
    <div className="min-h-screen bg-[#12314f] grid place-items-center">
      <div className="flex flex-col items-center gap-3 text-white">
        <div className="text-[40px] font-bold">৳</div>
        <Spinner className="w-6 h-6 text-white/70" />
        <div className="text-[12px] text-white/50">Payment Tracker</div>
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
    <Layout>
      <ErrorBoundary>
        <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/students" element={<Students />} />
        <Route path="/student/:id" element={<StudentDetail />} />
        <Route path="/payment/:id" element={<Payment />} />
        <Route path="/receipt/lookup" element={<ReceiptLookup />} />
        <Route path="/receipt/:id" element={<ReceiptView />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </ErrorBoundary>
    </Layout>
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
