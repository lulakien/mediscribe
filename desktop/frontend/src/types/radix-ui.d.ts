import * as React from 'react'

declare module '@radix-ui/react-dialog' {
  export interface DialogOverlayProps {
    className?: string
  }
  export interface DialogContentProps {
    className?: string
    children?: React.ReactNode
  }
  export interface DialogTriggerProps {
    children?: React.ReactNode
  }
  export interface DialogCloseProps {
    children?: React.ReactNode
  }
  export interface DialogTitleProps {
    className?: string
    children?: React.ReactNode
  }
  export interface DialogDescriptionProps {
    className?: string
    children?: React.ReactNode
  }
}

declare module '@radix-ui/react-select' {
  export interface SelectTriggerProps {
    className?: string
    children?: React.ReactNode
  }
  export interface SelectContentProps {
    className?: string
    children?: React.ReactNode
  }
  export interface SelectItemProps {
    className?: string
    children?: React.ReactNode
  }
  export interface SelectLabelProps {
    className?: string
  }
  export interface SelectSeparatorProps {
    className?: string
  }
  export interface SelectScrollUpButtonProps {
    className?: string
    children?: React.ReactNode
  }
  export interface SelectScrollDownButtonProps {
    className?: string
    children?: React.ReactNode
  }
  export interface SelectIconProps {
    children?: React.ReactNode
  }
  export interface SelectViewportProps {
    children?: React.ReactNode
  }
}

declare module '@radix-ui/react-switch' {
  export interface SwitchProps {
    className?: string
    children?: React.ReactNode
  }
  export interface SwitchThumbProps {
    className?: string
  }
}

declare module '@radix-ui/react-tabs' {
  export interface TabsProps {
    children?: React.ReactNode
  }
  export interface TabsListProps {
    className?: string
    children?: React.ReactNode
  }
  export interface TabsTriggerProps {
    className?: string
    children?: React.ReactNode
  }
  export interface TabsContentProps {
    className?: string
    children?: React.ReactNode
  }
}

declare module '@radix-ui/react-toast' {
  export interface ToastViewportProps {
    className?: string
  }
  export interface ToastProps {
    className?: string
    children?: React.ReactNode
  }
  export interface ToastActionProps {
    className?: string
  }
  export interface ToastCloseProps {
    className?: string
    children?: React.ReactNode
  }
  export interface ToastTitleProps {
    className?: string
    children?: React.ReactNode
  }
  export interface ToastDescriptionProps {
    className?: string
    children?: React.ReactNode
  }
}
