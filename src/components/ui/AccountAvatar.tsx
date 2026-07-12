'use client'

import Image from 'next/image'
import { useState } from 'react'

export type AccountAvatarSize = 'sm' | 'md' | 'lg'

export interface AccountAvatarProps {
  name: string
  avatarUrl: string | null
  size?: AccountAvatarSize
  alt?: string
  priority?: boolean
  className?: string
}

const dimensions: Record<AccountAvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 48,
}

const sizeClasses: Record<AccountAvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
}

const fallbackClasses = [
  'bg-blue-700 text-white',
  'bg-indigo-700 text-white',
  'bg-cyan-800 text-white',
  'bg-violet-700 text-white',
] as const

export function getAccountInitials(name: string) {
  const parts = name.normalize('NFKC').trim().split(/\s+/u).filter(Boolean)
  if (parts.length === 0) return '?'

  const first = parts[0]
  if (!first) return '?'
  if (parts.length === 1) return Array.from(first).slice(0, 2).join('').toUpperCase()

  const last = parts.at(-1)
  return `${Array.from(first)[0] ?? ''}${Array.from(last ?? '')[0] ?? ''}`.toUpperCase()
}

function fallbackClassFor(name: string) {
  let hash = 0
  for (const character of name.normalize('NFKC')) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0
  }
  return fallbackClasses[hash % fallbackClasses.length] ?? fallbackClasses[0]
}

function AccountAvatarContent({
  name,
  avatarUrl,
  size,
  alt,
  priority,
  className,
}: Required<Pick<AccountAvatarProps, 'name' | 'size' | 'alt' | 'priority' | 'className'>> &
  Pick<AccountAvatarProps, 'avatarUrl'>) {
  const [imageFailed, setImageFailed] = useState(false)
  const dimension = dimensions[size]
  const sharedClasses = `inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold uppercase ring-1 ring-black/10 dark:ring-white/15 ${sizeClasses[size]} ${className}`

  if (avatarUrl && !imageFailed) {
    return (
      <Image
        src={avatarUrl}
        alt={alt}
        width={dimension}
        height={dimension}
        priority={priority}
        unoptimized
        draggable={false}
        className={`${sharedClasses} object-cover`}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <span
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={`${sharedClasses} ${fallbackClassFor(name)}`}
    >
      {getAccountInitials(name)}
    </span>
  )
}

export function AccountAvatar({
  name,
  avatarUrl,
  size = 'md',
  alt = `${name.trim() || 'Account'} avatar`,
  priority = false,
  className = '',
}: AccountAvatarProps) {
  return (
    <AccountAvatarContent
      key={avatarUrl ?? 'initials'}
      name={name}
      avatarUrl={avatarUrl}
      size={size}
      alt={alt}
      priority={priority}
      className={className}
    />
  )
}
