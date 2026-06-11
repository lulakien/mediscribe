import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-pill px-2.5 py-1 text-[0.75rem] font-semibold tracking-[0.06em] uppercase transition-colors",
  {
    variants: {
      variant: {
        completed: "bg-success-soft text-success",
        running: "bg-primary-soft text-primary",
        failed: "bg-error-soft text-error",
        skipped: "bg-surface-2 text-text-muted",
        "scan-only": "bg-info text-text-muted",
        unsupported: "bg-warning-soft text-warning",
        installed: "bg-success-soft text-success",
        "not-installed": "bg-surface-2 text-text-muted",
        downloading: "bg-primary-soft text-primary",
        "ready-cuda": "bg-success-soft text-success",
        "failed-load": "bg-error-soft text-error",
        warning: "bg-warning-soft text-warning",
        default: "bg-surface-2 text-text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  pulse?: boolean
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, pulse = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      >
        {pulse && variant === "running" && (
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        )}
        {children}
      </div>
    )
  }
)
Badge.displayName = "Badge"

export { Badge, badgeVariants }
