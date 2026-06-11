import * as React from "react"

import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  max?: number
  indeterminate?: boolean
  label?: string
  showPercent?: boolean
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, indeterminate = false, label, showPercent = false, ...props }, ref) => {
    const percent = Math.round((value / max) * 100)

    return (
      <div ref={ref} className={cn("w-full", className)} {...props}>
        {(label || showPercent) && (
          <div className="flex justify-between items-center mb-2 text-small">
            {label && <span className="text-text-muted">{label}</span>}
            {showPercent && !indeterminate && (
              <span className="font-mono text-text-muted">{percent}%</span>
            )}
          </div>
        )}
        <div
          className="relative h-1.5 w-full overflow-hidden rounded-pill bg-surface-2"
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : value}
          aria-valuemax={max}
          aria-valuemin={0}
        >
          {indeterminate ? (
            <div
              className="h-full w-[30%] bg-primary rounded-pill animate-progress-indeterminate"
              style={{
                animation: "progress-indeterminate 1.4s ease-in-out infinite",
              }}
            />
          ) : (
            <div
              className="h-full bg-primary rounded-pill transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          )}
        </div>
      </div>
    )
  }
)
Progress.displayName = "Progress"

// Mini progress bar for queue rows
export const MiniProgress = React.forwardRef<
  HTMLDivElement,
  Omit<ProgressProps, 'label' | 'showPercent'>
>(({ className, value = 0, max = 100, indeterminate = false, ...props }, ref) => {
  const percent = Math.round((value / max) * 100)

  return (
    <div
      ref={ref}
      className={cn("relative h-1 w-full overflow-hidden rounded-pill bg-surface-2", className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemax={max}
      aria-valuemin={0}
      {...props}
    >
      {indeterminate ? (
        <div
          className="h-full w-[30%] bg-primary rounded-pill"
          style={{
            animation: "progress-indeterminate 1.4s ease-in-out infinite",
          }}
        />
      ) : (
        <div
          className="h-full bg-primary rounded-pill transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  )
})
MiniProgress.displayName = "MiniProgress"

export { Progress }
