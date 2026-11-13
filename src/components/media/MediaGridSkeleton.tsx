import Skeleton from '@/components/ui/Skeleton'

export function MediaCardSkeleton() {
    return (
        <div className="card overflow-hidden">
            <Skeleton className="aspect-[3/4] rounded-none" />
        </div>
    )
}

interface MediaGridSkeletonProps {
    count?: number
    viewMode?: 'grid' | 'list'
}

// Mirrors a StatusSection header so the layout doesn't jump when lists arrive
function SectionHeaderSkeleton() {
    return (
        <div className="flex items-center gap-2.5 py-2">
            <Skeleton className="w-2 h-2 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <span className="flex-1 h-px bg-edge" />
        </div>
    )
}

export default function MediaGridSkeleton({ count = 15, viewMode = 'grid' }: MediaGridSkeletonProps) {
    if (viewMode === 'list') {
        return (
            <div className="flex flex-col gap-1.5">
                <SectionHeaderSkeleton />
                {Array.from({ length: Math.min(count, 10) }).map((_, i) => (
                    <div key={i} className="card px-3 py-2 flex items-center gap-3">
                        <Skeleton className="w-8 h-11 rounded flex-shrink-0" />
                        <div className="flex-1">
                            <Skeleton className="h-4 w-2/5" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div>
            <SectionHeaderSkeleton />
            <div className="mt-1 cover-grid">
                {Array.from({ length: count }).map((_, i) => (
                    <MediaCardSkeleton key={i} />
                ))}
            </div>
        </div>
    )
}
