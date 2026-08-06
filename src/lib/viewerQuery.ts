// Single source of truth for the AniList Viewer query.
// Used by the client (getCurrentUser/refreshUser) and by the auth API routes,
// so custom list names always come back in the same fresh shape.
export const VIEWER_QUERY = `
  query GetCurrentUser {
    Viewer {
      id
      name
      avatar {
        large
        medium
      }
      bannerImage
      about
      options {
        titleLanguage
        displayAdultContent
        airingNotifications
        profileColor
      }
      mediaListOptions {
        scoreFormat
        rowOrder
        animeList {
          sectionOrder
          splitCompletedSectionByFormat
          customLists
          advancedScoring
          advancedScoringEnabled
        }
        mangaList {
          sectionOrder
          splitCompletedSectionByFormat
          customLists
          advancedScoring
          advancedScoringEnabled
        }
      }
      statistics {
        anime {
          count
          meanScore
          minutesWatched
          episodesWatched
        }
        manga {
          count
          meanScore
          chaptersRead
          volumesRead
        }
      }
    }
  }
`

/** Whitelist the Viewer payload to the shape stored in the session cookie */
export const pickSessionUser = (viewer: any) => ({
    id: viewer.id,
    name: viewer.name,
    avatar: viewer.avatar,
    bannerImage: viewer.bannerImage,
    about: viewer.about,
    options: viewer.options,
    mediaListOptions: viewer.mediaListOptions,
    statistics: viewer.statistics,
})
