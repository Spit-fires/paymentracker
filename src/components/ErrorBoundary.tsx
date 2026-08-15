import { Component, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Button } from './ui'
import { Logo } from './Logo'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-ink grid place-items-center px-6">
          <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
          className="max-w-sm text-center"
        >
            <Logo size={64} className="mx-auto mb-5" />
            <div className="text-white text-[18px] font-bold mb-2">Something went wrong</div>
            <div className="text-white/60 text-[13px] mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </div>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </motion.div>
        </div>
      )
    }
    return this.props.children
  }
}