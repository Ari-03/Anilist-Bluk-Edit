import { describe, expect, it } from 'vitest'

import { createDefaultListQuery } from '@/modules/media-list'
import { MediaFormat, MediaListStatus } from '@/types/anilist'
import {
  queryFromPreferences,
  queryToPreferences,
  viewModeFromPreferences,
} from './list-preferences'

describe('list preferences', () => {
  it('round-trips account/media query preferences without retaining a page', () => {
    const query = {
      ...createDefaultListQuery(),
      statuses: [MediaListStatus.COMPLETED],
      formats: [MediaFormat.TV],
      customLists: ['Favorites'],
      search: 'season',
      page: 4,
      pageSize: 250 as const,
      sort: { field: 'score' as const, direction: 'desc' as const },
    }

    const preferences = queryToPreferences(query, 'list')
    expect(preferences.viewMode).toBe('list')
    expect(viewModeFromPreferences(preferences)).toBe('list')
    expect(queryFromPreferences(preferences)).toMatchObject({
      statuses: [MediaListStatus.COMPLETED],
      formats: [MediaFormat.TV],
      customLists: ['Favorites'],
      search: 'season',
      page: 1,
      pageSize: 250,
      sort: { field: 'score', direction: 'desc' },
    })
  })

  it('defaults malformed or absent view modes to grid', () => {
    expect(viewModeFromPreferences()).toBe('grid')
    expect(
      viewModeFromPreferences({
        filters: {},
        viewMode: 'broken' as 'grid',
        pageSize: 100,
      }),
    ).toBe('grid')
  })

  it('drops invalid enum values from older preference records', () => {
    const restored = queryFromPreferences({
      filters: { statuses: ['CURRENT', 'BROKEN'], formats: ['TV', 'VHS'] },
      viewMode: 'grid',
      pageSize: 100,
    })

    expect(restored.statuses).toEqual([MediaListStatus.CURRENT])
    expect(restored.formats).toEqual([MediaFormat.TV])
  })
})
