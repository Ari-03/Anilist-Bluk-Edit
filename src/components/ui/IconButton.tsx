'use client'

import {
  type ButtonHTMLAttributes,
  type ReactNode,
  forwardRef,
} from 'react'

export type IconButtonVariant = 'ghost' | 'primary' | 'danger'
export type IconButtonSize = 'sm' | 'md'

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  label: string
  children: ReactNode
  variant?: IconButtonVariant
  size?: IconButtonSize
}

const variantClasses: Record<IconButtonVariant, string> = {
  ghost:
    'text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white',
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400',
  danger:
    'text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50',
}

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'min-h-11 min-w-11 p-2.5',
  md: 'min-h-11 min-w-11 p-3',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      children,
      variant = 'ghost',
      size = 'md',
      className = '',
      type = 'button',
      ...buttonProps
    },
    ref,
  ) {
    return (
      <button
        {...buttonProps}
        ref={ref}
        type={type}
        aria-label={label}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-offset-gray-900 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      >
        {children}
      </button>
    )
  },
)
