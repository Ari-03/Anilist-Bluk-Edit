import { AniListClient, RelationMediaNode } from '@/lib/anilist'
import { RateLimiter } from '@/lib/rateLimiter'
import { MediaType } from '@/types/anilist'

export interface DiscoveredRelation {
    media: RelationMediaNode
    /** Direction relative to the entry it was found from */
    relationType: 'SEQUEL' | 'PREQUEL'
    /** BFS depth: 1 = direct sequel/prequel of a selected entry */
    depth: number
}

export interface DiscoveryProgress {
    round: number
    found: number
}

interface DiscoverOptions {
    client: AniListClient
    rateLimiter: RateLimiter
    seedMediaIds: number[]
    mediaType: MediaType
    maxDepth?: number
    maxNodes?: number
    onProgress?: (progress: DiscoveryProgress) => void
    isCancelled?: () => boolean
}

const IDS_PER_REQUEST = 12

const chunk = <T,>(arr: T[], size: number): T[][] =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    )

/**
 * Breadth-first walk of PREQUEL/SEQUEL edges starting from the selected
 * entries. Each round batch-fetches relations for the frontier; cycles and
 * diamond paths are killed by the visited set. All formats are traversed
 * (chains sometimes route TV → Special → TV) — display filtering is the
 * caller's concern.
 */
export async function discoverRelations({
    client,
    rateLimiter,
    seedMediaIds,
    mediaType,
    maxDepth = 5,
    maxNodes = 100,
    onProgress,
    isCancelled,
}: DiscoverOptions): Promise<DiscoveredRelation[]> {
    const visited = new Set<number>(seedMediaIds)
    const discovered = new Map<number, DiscoveredRelation>()
    let frontier = [...seedMediaIds]

    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
        if (isCancelled?.() || discovered.size >= maxNodes) break

        const nextFrontier: number[] = []

        for (const ids of chunk(frontier, IDS_PER_REQUEST)) {
            if (isCancelled?.() || discovered.size >= maxNodes) break

            const results = await rateLimiter.execute(() => client.getMediaRelations(ids))

            for (const media of results) {
                for (const edge of media.relations?.edges || []) {
                    const relationType = edge.relationType
                    const node = edge.node
                    if (!node) continue
                    if (relationType !== 'SEQUEL' && relationType !== 'PREQUEL') continue
                    if (node.type !== mediaType) continue
                    if (visited.has(node.id)) continue

                    visited.add(node.id)
                    discovered.set(node.id, { media: node, relationType, depth })
                    nextFrontier.push(node.id)

                    if (discovered.size >= maxNodes) break
                }
            }

            onProgress?.({ round: depth, found: discovered.size })
        }

        frontier = nextFrontier
    }

    return Array.from(discovered.values())
}
