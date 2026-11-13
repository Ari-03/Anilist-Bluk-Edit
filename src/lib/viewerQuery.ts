// Single source of truth for the AniList Viewer query (AniListClient.getCurrentUser),
// so the profile and its custom list names always come back in the same shape.
export const VIEWER_QUERY = `
  query GetCurrentUser {
    Viewer {
      id
      name
      avatar {
        large
        medium
      }
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
    }
  }
`
