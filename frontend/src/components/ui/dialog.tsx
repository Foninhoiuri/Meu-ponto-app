import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in",
        className
      )}
      {...props}
    />
  )
}

interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content> {
  /** fullscreen: ocupa a tela toda (ex.: Histórico) */
  variant?: "sheet" | "fullscreen"
  showClose?: boolean
}

function DialogContent({
  className,
  children,
  variant = "sheet",
  showClose = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // Glass: surface translúcida + blur, borda e sombra como os cards da Home
          "fixed z-50 flex flex-col overflow-hidden bg-surface/85 backdrop-blur-2xl border border-white/10 text-foreground shadow-2xl animate-slide-up focus:outline-none",
          variant === "fullscreen"
            ? "inset-x-0 bottom-0 top-[max(0.5rem,env(safe-area-inset-top))] rounded-t-[2rem]"
            : "inset-x-0 bottom-0 mx-auto w-full max-w-md max-h-[92dvh] rounded-t-[2rem] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-[2rem]",
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full glass text-textSecondary transition-colors hover:text-white focus:outline-none"
          >
            <X size={18} />
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1 p-6 pb-4", className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold text-white", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-xs text-textSecondary", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
}
