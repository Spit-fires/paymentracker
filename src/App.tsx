import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { useEffect, useState } from 'react'
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
import { Attendance } from './pages/Attendance'
import { Routines } from './pages/Routines'
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

const WELCOME_TEXT = 'Welcome back'

/** Centered, animated greeting shown once per app load (after login/lock). */
function WelcomeBack() {
  const { center } = useApp()
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setGone(true), 1500)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <AnimatePresence>
      {!gone && (
        <motion.div
          key="welcome"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="no-print fixed inset-0 z-[80] grid place-items-center bg-white dark:bg-[#0b1622]"
        >
          <div className="flex flex-col items-center gap-5">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              <Logo size={44} />
            </motion.div>
            <div className="flex overflow-hidden">
              {WELCOME_TEXT.split('').map((ch, i) => (
                <motion.span
                  key={i}
                  initial={{ y: 26, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    delay: 0.15 + i * 0.035,
                    duration: 0.45,
                    ease: [0.25, 0.1, 0.25, 1],
                  }}
                  className="text-[26px] font-bold text-ink dark:text-white tracking-tight"
                >
                  {ch === ' ' ? '\u00A0' : ch}
                </motion.span>
              ))}
            </div>
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="max-w-[85vw] truncate text-[20px] font-bold text-ink dark:text-accent-dark"
            >
              {center.name || 'UTSAHO EDUCARE'}
            </motion.div>
          </div>
          <a
            href="https://fh.js.cool/"
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-5 inset-x-0 text-center text-[12px] font-medium text-ink/40 dark:text-white/40 hover:text-ink/70 dark:hover:text-white/70 transition-colors"
          >
            Made by Fahad Hossain
          </a>
        </motion.div>
      )}
    </AnimatePresence>
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
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/routines" element={<Routines />} />
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
      <WelcomeBack />
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
