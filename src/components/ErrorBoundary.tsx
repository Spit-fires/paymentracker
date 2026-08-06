import { Component, type ReactNode } from 'react'
import { Button } from './ui'

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
          <div className="max-w-sm text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-white/10 grid place-items-center text-white text-[36px] font-bold mb-5">
              ৳
            </div>
            <div className="text-white text-[18px] font-bold mb-2">Something went wrong</div>
            <div className="text-white/60 text-[13px] mb-6">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </div>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}