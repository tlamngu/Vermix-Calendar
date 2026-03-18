import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus disabled:pointer-events-none disabled:opacity-50 h-11 px-4 sm:h-10 active:scale-95",
  {
    variants: {
      variant: {
        default: "bg-accent-primary text-bg-primary hover:bg-white/90",
        secondary: "bg-transparent text-text-primary border border-border-default hover:bg-surface-hover",
        ghost: "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary border-none",
        icon: "h-11 w-11 sm:h-10 sm:w-10 p-0 bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        danger: "bg-accent-red text-white hover:bg-accent-red/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
