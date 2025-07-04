// AniList API Types
export interface User {
    id: number;
    name: string;
    avatar?: {
        large?: string;
        medium?: string;
    };
    bannerImage?: string;
    about?: string;
    isFollowing?: boolean;
    isFollower?: boolean;
    isBlocked?: boolean;
    bans?: string;
    options?: UserOptions;
    mediaListOptions?: MediaListOptions;
    statistics?: UserStatistics;
}

export interface UserOptions {
    titleLanguage?: UserTitleLanguage;
    displayAdultContent?: boolean;
    airingNotifications?: boolean;
    profileColor?: string;
    notificationOptions?: NotificationOption[];
}

export interface MediaListOptions {
    scoreFormat?: ScoreFormat;
    rowOrder?: string;
    animeList?: MediaListTypeOptions;
    mangaList?: MediaListTypeOptions;
}

export interface MediaListTypeOptions {
    sectionOrder?: string[];
    splitCompletedSectionByFormat?: boolean;
    theme?: string;
    customLists?: string[];
    advancedScoring?: string[];
    advancedScoringEnabled?: boolean;
}

export interface Media {
    id: number;
    idMal?: number;
    title: MediaTitle;
    type: MediaType;
    format?: MediaFormat;
    status?: MediaStatus;
    description?: string;
    startDate?: FuzzyDate;
    endDate?: FuzzyDate;
    season?: MediaSeason;
    seasonYear?: number;
    seasonInt?: number;
    episodes?: number;
    duration?: number;
    chapters?: number;
    volumes?: number;
    countryOfOrigin?: string;
    isLicensed?: boolean;
    source?: MediaSource;
    hashtag?: string;
    trailer?: MediaTrailer;
    updatedAt?: number;
    coverImage?: MediaCoverImage;
    bannerImage?: string;
    genres?: string[];
    synonyms?: string[];
    averageScore?: number;
    meanScore?: number;
    popularity?: number;
    isLocked?: boolean;
    trending?: number;
    favourites?: number;
    tags?: MediaTag[];
    relations?: MediaConnection;
    characters?: CharacterConnection;
    staff?: StaffConnection;
    studios?: StudioConnection;
    isFavourite?: boolean;
    isAdult?: boolean;
    nextAiringEpisode?: AiringSchedule;
    airingSchedule?: AiringScheduleConnection;
    trends?: MediaTrendConnection;
    externalLinks?: MediaExternalLink[];
    streamingEpisodes?: MediaStreamingEpisode[];
    rankings?: MediaRank[];
    mediaListEntry?: MediaList;
    reviews?: ReviewConnection;
    recommendations?: RecommendationConnection;
    stats?: MediaStats;
    siteUrl?: string;
    autoCreateForumThread?: boolean;
    isRecommendationBlocked?: boolean;
    modNotes?: string;
}

export interface MediaTitle {
    romaji?: string;
    english?: string;
    native?: string;
    userPreferred?: string;
}

export interface MediaCoverImage {
    extraLarge?: string;
    large?: string;
    medium?: string;
    color?: string;
}

export interface MediaList {
    id: number;
    userId: number;
    mediaId: number;
    status?: MediaListStatus;
    score?: number;
    progress?: number;
    progressVolumes?: number;
    repeat?: number;
    priority?: number;
    private?: boolean;
    notes?: string;
    hiddenFromStatusLists?: boolean;
    customLists?: Record<string, boolean>;
    advancedScores?: Record<string, number>;
    startedAt?: FuzzyDate;
    completedAt?: FuzzyDate;
    updatedAt?: number;
    createdAt?: number;
    media?: Media;
    user?: User;
}

export interface FuzzyDate {
    year?: number;
    month?: number;
    day?: number;
}

export interface MediaTag {
    id: number;
    name: string;
    description?: string;
    category?: string;
    rank?: number;
    isGeneralSpoiler?: boolean;
    isMediaSpoiler?: boolean;
    isAdult?: boolean;
    userId?: number;
}

export interface MediaTrailer {
    id?: string;
    site?: string;
    thumbnail?: string;
}

export interface MediaExternalLink {
    id: number;
    url: string;
    site: string;
    type?: ExternalLinkType;
    language?: string;
    color?: string;
    icon?: string;
}

export interface MediaStreamingEpisode {
    title?: string;
    thumbnail?: string;
    url?: string;
    site?: string;
}

export interface MediaRank {
    id: number;
    rank: number;
    type: MediaRankType;
    format: MediaFormat;
    year?: number;
    season?: MediaSeason;
    allTime?: boolean;
    context: string;
}

export interface AiringSchedule {
    id: number;
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
    mediaId: number;
    media?: Media;
}

// Enums
export enum MediaType {
    ANIME = 'ANIME',
    MANGA = 'MANGA'
}

export enum MediaFormat {
    TV = 'TV',
    TV_SHORT = 'TV_SHORT',
    MOVIE = 'MOVIE',
    SPECIAL = 'SPECIAL',
    OVA = 'OVA',
    ONA = 'ONA',
    MUSIC = 'MUSIC',
    MANGA = 'MANGA',
    NOVEL = 'NOVEL',
    ONE_SHOT = 'ONE_SHOT'
}

export enum MediaStatus {
    FINISHED = 'FINISHED',
    RELEASING = 'RELEASING',
    NOT_YET_RELEASED = 'NOT_YET_RELEASED',
    CANCELLED = 'CANCELLED',
    HIATUS = 'HIATUS'
}

export enum MediaListStatus {
    CURRENT = 'CURRENT',
    PLANNING = 'PLANNING',
    COMPLETED = 'COMPLETED',
    DROPPED = 'DROPPED',
    PAUSED = 'PAUSED',
    REPEATING = 'REPEATING'
}

export enum MediaSeason {
    WINTER = 'WINTER',
    SPRING = 'SPRING',
    SUMMER = 'SUMMER',
    FALL = 'FALL'
}

export enum MediaSource {
    ORIGINAL = 'ORIGINAL',
    MANGA = 'MANGA',
    LIGHT_NOVEL = 'LIGHT_NOVEL',
    VISUAL_NOVEL = 'VISUAL_NOVEL',
    VIDEO_GAME = 'VIDEO_GAME',
    OTHER = 'OTHER',
    NOVEL = 'NOVEL',
    DOUJINSHI = 'DOUJINSHI',
    ANIME = 'ANIME',
    WEB_NOVEL = 'WEB_NOVEL',
    LIVE_ACTION = 'LIVE_ACTION',
    GAME = 'GAME',
    COMIC = 'COMIC',
    MULTIMEDIA_PROJECT = 'MULTIMEDIA_PROJECT',
    PICTURE_BOOK = 'PICTURE_BOOK'
}

export enum ScoreFormat {
    POINT_100 = 'POINT_100',
    POINT_10_DECIMAL = 'POINT_10_DECIMAL',
    POINT_10 = 'POINT_10',
    POINT_5 = 'POINT_5',
    POINT_3 = 'POINT_3'
}

export enum UserTitleLanguage {
    ROMAJI = 'ROMAJI',
    ENGLISH = 'ENGLISH',
    NATIVE = 'NATIVE',
    ROMAJI_STYLISED = 'ROMAJI_STYLISED',
    ENGLISH_STYLISED = 'ENGLISH_STYLISED',
    NATIVE_STYLISED = 'NATIVE_STYLISED'
}

export enum MediaRankType {
    RATED = 'RATED',
    POPULAR = 'POPULAR'
}

export enum ExternalLinkType {
    INFO = 'INFO',
    STREAMING = 'STREAMING',
    SOCIAL = 'SOCIAL'
}

// Placeholder interfaces for complex types (to be expanded if needed)
export interface MediaConnection {
    edges?: MediaEdge[];
    nodes?: Media[];
    pageInfo?: PageInfo;
}

export interface MediaEdge {
    node?: Media;
    id?: number;
    relationType?: MediaRelation;
    isMainStudio?: boolean;
    characters?: Character[];
    characterRole?: CharacterRole;
    characterName?: string;
    roleNotes?: string;
    dubGroup?: string;
    staffRole?: string;
    voiceActors?: Staff[];
    voiceActorRoles?: VoiceActorRole[];
    favouriteOrder?: number;
}

export enum MediaRelation {
    ADAPTATION = 'ADAPTATION',
    PREQUEL = 'PREQUEL',
    SEQUEL = 'SEQUEL',
    PARENT = 'PARENT',
    SIDE_STORY = 'SIDE_STORY',
    CHARACTER = 'CHARACTER',
    SUMMARY = 'SUMMARY',
    ALTERNATIVE = 'ALTERNATIVE',
    SPIN_OFF = 'SPIN_OFF',
    OTHER = 'OTHER',
    SOURCE = 'SOURCE',
    COMPILATION = 'COMPILATION',
    CONTAINS = 'CONTAINS'
}

export interface PageInfo {
    total?: number;
    perPage?: number;
    currentPage?: number;
    lastPage?: number;
    hasNextPage?: boolean;
}

export interface Character {
    id: number;
    name?: CharacterName;
    image?: CharacterImage;
    description?: string;
    gender?: string;
    dateOfBirth?: FuzzyDate;
    age?: string;
    bloodType?: string;
    isFavourite?: boolean;
    isFavouriteBlocked?: boolean;
    siteUrl?: string;
    media?: MediaConnection;
    updatedAt?: number;
    favourites?: number;
    modNotes?: string;
}

export interface CharacterName {
    first?: string;
    middle?: string;
    last?: string;
    full?: string;
    native?: string;
    alternative?: string[];
    alternativeSpoiler?: string[];
    userPreferred?: string;
}

export interface CharacterImage {
    large?: string;
    medium?: string;
}

export interface CharacterConnection {
    edges?: CharacterEdge[];
    nodes?: Character[];
    pageInfo?: PageInfo;
}

export interface CharacterEdge {
    node?: Character;
    id?: number;
    role?: CharacterRole;
    name?: string;
    voiceActors?: Staff[];
    voiceActorRoles?: VoiceActorRole[];
    media?: Media[];
    favouriteOrder?: number;
}

export enum CharacterRole {
    MAIN = 'MAIN',
    SUPPORTING = 'SUPPORTING',
    BACKGROUND = 'BACKGROUND'
}

export interface Staff {
    id: number;
    name?: StaffName;
    language?: StaffLanguage;
    image?: StaffImage;
    description?: string;
    primaryOccupations?: string[];
    gender?: string;
    dateOfBirth?: FuzzyDate;
    dateOfDeath?: FuzzyDate;
    age?: number;
    yearsActive?: number[];
    homeTown?: string;
    bloodType?: string;
    isFavourite?: boolean;
    isFavouriteBlocked?: boolean;
    siteUrl?: string;
    staffMedia?: MediaConnection;
    characters?: CharacterConnection;
    characterMedia?: MediaConnection;
    updatedAt?: number;
    favourites?: number;
    modNotes?: string;
}

export interface StaffName {
    first?: string;
    middle?: string;
    last?: string;
    full?: string;
    native?: string;
    alternative?: string[];
    userPreferred?: string;
}

export interface StaffImage {
    large?: string;
    medium?: string;
}

export interface StaffConnection {
    edges?: StaffEdge[];
    nodes?: Staff[];
    pageInfo?: PageInfo;
}

export interface StaffEdge {
    node?: Staff;
    id?: number;
    role?: string;
    favouriteOrder?: number;
}

export enum StaffLanguage {
    JAPANESE = 'JAPANESE',
    ENGLISH = 'ENGLISH',
    KOREAN = 'KOREAN',
    ITALIAN = 'ITALIAN',
    SPANISH = 'SPANISH',
    PORTUGUESE = 'PORTUGUESE',
    FRENCH = 'FRENCH',
    GERMAN = 'GERMAN',
    HEBREW = 'HEBREW',
    HUNGARIAN = 'HUNGARIAN'
}

export interface VoiceActorRole {
    voiceActor?: Staff;
    roleNotes?: string;
    dubGroup?: string;
}

export interface Studio {
    id: number;
    name: string;
    isAnimationStudio?: boolean;
    media?: MediaConnection;
    siteUrl?: string;
    isFavourite?: boolean;
    favourites?: number;
}

export interface StudioConnection {
    edges?: StudioEdge[];
    nodes?: Studio[];
    pageInfo?: PageInfo;
}

export interface StudioEdge {
    node?: Studio;
    id?: number;
    isMain?: boolean;
    favouriteOrder?: number;
}

export interface AiringScheduleConnection {
    edges?: AiringScheduleEdge[];
    nodes?: AiringSchedule[];
    pageInfo?: PageInfo;
}

export interface AiringScheduleEdge {
    node?: AiringSchedule;
    id?: number;
}

export interface MediaTrendConnection {
    edges?: MediaTrendEdge[];
    nodes?: MediaTrend[];
    pageInfo?: PageInfo;
}

export interface MediaTrend {
    mediaId: number;
    date: number;
    trending: number;
    averageScore?: number;
    popularity?: number;
    inProgress?: number;
    releasing: boolean;
    episode?: number;
    media?: Media;
}

export interface MediaTrendEdge {
    node?: MediaTrend;
}

export interface ReviewConnection {
    edges?: ReviewEdge[];
    nodes?: Review[];
    pageInfo?: PageInfo;
}

export interface Review {
    id: number;
    userId: number;
    mediaId: number;
    mediaType?: MediaType;
    summary?: string;
    body?: string;
    rating?: number;
    ratingAmount?: number;
    userRating?: ReviewRating;
    score?: number;
    private?: boolean;
    siteUrl?: string;
    createdAt: number;
    updatedAt: number;
    user?: User;
    media?: Media;
}

export interface ReviewEdge {
    node?: Review;
}

export enum ReviewRating {
    NO_VOTE = 'NO_VOTE',
    UP_VOTE = 'UP_VOTE',
    DOWN_VOTE = 'DOWN_VOTE'
}

export interface RecommendationConnection {
    edges?: RecommendationEdge[];
    nodes?: Recommendation[];
    pageInfo?: PageInfo;
}

export interface Recommendation {
    id: number;
    rating?: number;
    userRating?: RecommendationRating;
    media?: Media;
    mediaRecommendation?: Media;
    user?: User;
}

export interface RecommendationEdge {
    node?: Recommendation;
}

export enum RecommendationRating {
    NO_VOTE = 'NO_VOTE',
    RATE_UP = 'RATE_UP',
    RATE_DOWN = 'RATE_DOWN'
}

export interface MediaStats {
    scoreDistribution?: ScoreDistribution[];
    statusDistribution?: StatusDistribution[];
}

export interface ScoreDistribution {
    score?: number;
    amount?: number;
}

export interface StatusDistribution {
    status?: MediaListStatus;
    amount?: number;
}

export interface UserStatistics {
    anime?: UserStatisticTypes;
    manga?: UserStatisticTypes;
}

export interface UserStatisticTypes {
    count?: number;
    meanScore?: number;
    standardDeviation?: number;
    minutesWatched?: number;
    episodesWatched?: number;
    chaptersRead?: number;
    volumesRead?: number;
    formats?: UserFormatStatistic[];
    statuses?: UserStatusStatistic[];
    scores?: UserScoreStatistic[];
    lengths?: UserLengthStatistic[];
    releaseYears?: UserReleaseYearStatistic[];
    startYears?: UserStartYearStatistic[];
    genres?: UserGenreStatistic[];
    tags?: UserTagStatistic[];
    countries?: UserCountryStatistic[];
    voiceActors?: UserVoiceActorStatistic[];
    staff?: UserStaffStatistic[];
    studios?: UserStudioStatistic[];
}

export interface UserFormatStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    format?: MediaFormat;
}

export interface UserStatusStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    status?: MediaListStatus;
}

export interface UserScoreStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    score?: number;
}

export interface UserLengthStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    length?: string;
}

export interface UserReleaseYearStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    releaseYear?: number;
}

export interface UserStartYearStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    startYear?: number;
}

export interface UserGenreStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    genre?: string;
}

export interface UserTagStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    tag?: MediaTag;
}

export interface UserCountryStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    country?: string;
}

export interface UserVoiceActorStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    voiceActor?: Staff;
    characterIds: number[];
}

export interface UserStaffStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    staff?: Staff;
}

export interface UserStudioStatistic {
    count: number;
    meanScore: number;
    minutesWatched: number;
    chaptersRead: number;
    mediaIds: number[];
    studio?: Studio;
}

export interface NotificationOption {
    type?: NotificationType;
    enabled?: boolean;
}

export enum NotificationType {
    ACTIVITY_MESSAGE = 'ACTIVITY_MESSAGE',
    ACTIVITY_REPLY = 'ACTIVITY_REPLY',
    FOLLOWING = 'FOLLOWING',
    ACTIVITY_MENTION = 'ACTIVITY_MENTION',
    THREAD_COMMENT_MENTION = 'THREAD_COMMENT_MENTION',
    THREAD_SUBSCRIBED = 'THREAD_SUBSCRIBED',
    THREAD_COMMENT_REPLY = 'THREAD_COMMENT_REPLY',
    AIRING = 'AIRING',
    ACTIVITY_LIKE = 'ACTIVITY_LIKE',
    ACTIVITY_REPLY_LIKE = 'ACTIVITY_REPLY_LIKE',
    THREAD_LIKE = 'THREAD_LIKE',
    THREAD_COMMENT_LIKE = 'THREAD_COMMENT_LIKE',
    ACTIVITY_REPLY_SUBSCRIBED = 'ACTIVITY_REPLY_SUBSCRIBED',
    RELATED_MEDIA_ADDITION = 'RELATED_MEDIA_ADDITION',
    MEDIA_DATA_CHANGE = 'MEDIA_DATA_CHANGE',
    MEDIA_MERGE = 'MEDIA_MERGE',
    MEDIA_DELETION = 'MEDIA_DELETION'
} 