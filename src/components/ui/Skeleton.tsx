import { cn } from '@/lib/utils'

interface SkeletonProps {
    className?: string
}

export default function Skeleton({ className }: SkeletonProps) {
    return (
        <div className={cn('relative overflow-hidden rounded-lg bg-raised', className)}>
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-fg/5 to-transparent" />
        </div>
    )
}
