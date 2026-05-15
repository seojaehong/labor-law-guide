"use client"

import { Button, buttonVariants } from "@/components/decisions-ui/button"
import { cn } from "@/lib/utils"
import { VariantProps } from "class-variance-authority"

export type PromptSuggestionProps = {
  children: React.ReactNode
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function PromptSuggestion({
  children,
  variant,
  size,
  className,
  ...props
}: PromptSuggestionProps) {
  return (
    <Button
      variant={variant || "outline"}
      size={size || "sm"}
      className={cn("rounded-full text-xs", className)}
      {...props}
    >
      {children}
    </Button>
  )
}

export { PromptSuggestion }
