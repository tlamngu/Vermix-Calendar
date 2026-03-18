import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface-default border border-border-subtle p-4 transition-colors hover:bg-surface-hover hover:border-border-default",
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

export { Card }
