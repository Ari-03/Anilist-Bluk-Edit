import { useCallback, useSyncExternalStore } from 'react'

import type {
  CollectionKey,
  CollectionSnapshot,
  ObservableMediaListWorkspace,
} from '@/modules/media-list'

export function useWorkspaceCollection(
  workspace: ObservableMediaListWorkspace,
  key: CollectionKey,
): CollectionSnapshot {
  const accountId = key.accountId
  const mediaType = key.mediaType
  const getSnapshot = useCallback(
    () => workspace.getCollection({ accountId, mediaType }),
    [accountId, mediaType, workspace],
  )
  const subscribe = useCallback(
    (listener: () => void) => workspace.subscribe(listener),
    [workspace],
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
