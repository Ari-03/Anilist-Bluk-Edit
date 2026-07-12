export const MediaType = {
  ANIME: 'ANIME',
  MANGA: 'MANGA',
} as const
export type MediaType = (typeof MediaType)[keyof typeof MediaType]

export const MediaFormat = {
  TV: 'TV',
  TV_SHORT: 'TV_SHORT',
  MOVIE: 'MOVIE',
  SPECIAL: 'SPECIAL',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'MUSIC',
  MANGA: 'MANGA',
  NOVEL: 'NOVEL',
  ONE_SHOT: 'ONE_SHOT',
} as const
export type MediaFormat = (typeof MediaFormat)[keyof typeof MediaFormat]

export const MediaListStatus = {
  CURRENT: 'CURRENT',
  PLANNING: 'PLANNING',
  COMPLETED: 'COMPLETED',
  DROPPED: 'DROPPED',
  PAUSED: 'PAUSED',
  REPEATING: 'REPEATING',
} as const
export type MediaListStatus =
  (typeof MediaListStatus)[keyof typeof MediaListStatus]

export const ScoreFormat = {
  POINT_100: 'POINT_100',
  POINT_10_DECIMAL: 'POINT_10_DECIMAL',
  POINT_10: 'POINT_10',
  POINT_5: 'POINT_5',
  POINT_3: 'POINT_3',
} as const
export type ScoreFormat = (typeof ScoreFormat)[keyof typeof ScoreFormat]

export interface FuzzyDate {
  year?: number
  month?: number
  day?: number
}

export interface MediaTitle {
  romaji?: string
  english?: string
  native?: string
  userPreferred?: string
}

export interface MediaCoverImage {
  large?: string
  medium?: string
  color?: string
}

/** Immutable media metadata retained when mutable list-entry patches arrive. */
export interface Media {
  id: number
  title: MediaTitle
  type: MediaType
  format?: MediaFormat
  startDate?: FuzzyDate
  seasonYear?: number
  episodes?: number
  chapters?: number
  countryOfOrigin?: string
  genres?: string[]
  coverImage?: MediaCoverImage
}

/** Viewer-specific source record; `id` is a list-entry ID, not a media ID. */
export interface MediaList {
  id: number
  userId: number
  mediaId: number
  status?: MediaListStatus
  score?: number
  progress?: number
  private?: boolean
  notes?: string
  hiddenFromStatusLists?: boolean
  customLists?: Record<string, boolean>
  startedAt?: FuzzyDate
  updatedAt?: number
  media?: Media
}
