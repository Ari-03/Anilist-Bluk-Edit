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
            <div className="flex flex-col gap-2">
                <SectionHeaderSkeleton />
                {Array.from({ length: Math.min(count, 10) }).map((_, i) => (
                    <div key={i} className="card p-3 flex items-center gap-3">
                        <Skeleton className="w-11 h-[60px] rounded-md flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-2/5" />
                            <Skeleton className="h-3 w-1/4" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div>
            <SectionHeaderSkeleton />
            <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {Array.from({ length: count }).map((_, i) => (
                    <MediaCardSkeleton key={i} />
                ))}
            </div>
        </div>
    )
}
