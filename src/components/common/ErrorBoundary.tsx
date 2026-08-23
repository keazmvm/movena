import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ErrorState';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary that catches unhandled render exceptions and
 * failed lazy-chunk loads, preventing a full white-screen crash.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100%' }}>
          <ErrorState
            title={this.props.fallbackTitle ?? 'Something went wrong'}
            description={
              this.props.fallbackDescription ??
              'An unexpected error occurred. Try reloading or restarting the application.'
            }
            detail={this.state.error?.stack || this.state.error?.message}
            actionLabel="Try Again"
            onAction={this.handleReload}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
