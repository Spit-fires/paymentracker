import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
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
import { Logo } from './components/Logo'
import { AppMotion, pageVariants } from './components/anim'

function Splash() {
  return (
    <div className="min-h-screen bg-ink grid place-items-center">
      <div className="flex flex-col items-center gap-4">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          <Logo size={64} />
        </motion.div>
        <Spinner className="w-6 h-6 text-white/70" />
        <div className="text-[12px] text-white/50 tracking-wide">Payment Tracker</div>
      </div>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <Routes location={location}>
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
      </motion.div>
    </AnimatePresence>
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
        <AnimatedRoutes />
      </Layout>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppMotion>
        <HashRouter>
          <Gate />
        </HashRouter>
      </AppMotion>
    </AppProvider>
  )
}
