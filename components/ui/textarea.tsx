import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[44px] sm:min-h-[48px] w-full rounded-2xl bg-surface-default border border-border-default px-4 py-3 text-sm text-text-primary shadow-sm transition-all placeholder:text-text-placeholder focus-visible:outline-none focus-visible:border-border-focus focus-visible:ring-1 focus-visible:ring-border-focus/20 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
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
