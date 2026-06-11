import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-button text-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-primary text-[#FFF9EE] hover:bg-primary-hover",
        secondary: "bg-transparent border border-border-strong text-text hover:bg-surface-2",
        ghost: "text-text-muted hover:bg-surface-2",
        danger: "bg-transparent border border-error text-error hover:bg-error-soft",
        "danger-filled": "bg-error text-[#FFF9EE] hover:bg-error/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        compact: "h-9 px-3 py-1.5",
        icon: "h-8 w-8",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
