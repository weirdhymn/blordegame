import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** The app-root error boundary (§11 hardening): one bad render (a malformed genotype, a canvas
 *  hiccup) shows a cozy recovery card instead of white-screening the whole game. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('render crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page">
        <div className="card placeholder">
          <h1>A horse chewed a cable 🔌</h1>
          <p>
            Something in the pasture broke mid-render. Your herd is safe on the server — this is
            only the picture of it.
          </p>
          <p className="muted">{this.state.error.message}</p>
          <div className="row-actions">
            <button className="primary" onClick={() => window.location.reload()}>
              Reload the pasture
            </button>
          </div>
        </div>
      </main>
    );
  }
}
