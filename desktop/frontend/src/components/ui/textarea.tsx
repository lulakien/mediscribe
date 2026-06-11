import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-button bg-surface border border-border px-3 py-2 text-body placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
