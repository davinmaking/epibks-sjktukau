"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg font-medium text-destructive">页面加载出错</p>
          <p className="text-sm text-muted-foreground">
            请刷新页面重试，如果问题持续存在请联系管理员
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false })}
          >
            重试
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
