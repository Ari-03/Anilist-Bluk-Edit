# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint for code quality checks
- `npm run type-check` - Run TypeScript type checking

### Testing
- Check package.json for testing scripts
- Use `npm run lint` and `npm run type-check` before committing

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 14 with TypeScript
- **Authentication**: Custom token-based authentication with AniList personal access tokens
- **State Management**: Zustand with persistence
- **Styling**: Tailwind CSS
- **API Client**: GraphQL with graphql-request
- **Rate Limiting**: Custom implementation for AniList API

### Key Directories
- `src/components/` - React components (BulkEditPanel, MediaListView, FilterPanel, etc.)
- `src/lib/` - Utilities and API clients (anilist.ts, rateLimiter.ts)
- `src/store/` - Zustand store for application state
- `src/types/` - TypeScript type definitions for AniList API
- `src/pages/` - Next.js pages and API routes

### Core Components
- **MediaListView**: Main component displaying anime/manga collections
- **BulkEditPanel**: Interface for bulk editing operations
- **FilterPanel**: Advanced filtering and search functionality
- **Layout**: Main layout wrapper with navigation

### State Management (src/store/index.ts)
- Uses Zustand with persistence for state management
- Manages user data, media lists, bulk edit state, filters, and UI state
- Key state includes:
  - `animeLists`/`mangaLists`: Media collection data
  - `selectedEntries`: Set of selected entries for bulk operations
  - `bulkEditMode`: Boolean for bulk edit mode
  - `filters`: Filter options and search state
  - `filteredEntries`: Computed filtered results

### AniList API Integration (src/lib/anilist.ts)
- **AniListClient**: Main GraphQL client class
- Key methods:
  - `getCurrentUser()`: Get authenticated user data
  - `getAllMediaLists()`: Fetch complete media collections
  - `updateMediaListEntry()`: Update single entry
  - `bulkUpdateMediaListEntries()`: Batch update multiple entries
  - `searchMedia()`: Search AniList database
- Utility functions for score display and status handling

### Rate Limiting (src/lib/rateLimiter.ts)
- Custom rate limiter for AniList API compliance
- Default: 0.5 requests/second (30 requests/minute)
- Implements retry logic with exponential backoff
- Tracks stats: total requests, success/failure rates, response times
- Handles rate limit errors with 60-second delays

### Authentication
- **Dual Authentication Methods**: OAuth flow and manual token entry
- **OAuth Flow**: Seamless authentication via AniList OAuth (requires Client ID configuration)
- **Manual Token**: Fallback method for users who prefer personal access tokens
- **Secure Storage**: Tokens stored in httpOnly cookies instead of localStorage
- **Session Management**: Automatic session validation and expiration handling
- **Migration Support**: Automatically migrates old localStorage tokens to secure storage

#### Authentication Components
- `src/contexts/AuthContext.tsx` - Enhanced auth context with OAuth support
- `src/pages/auth/callback.tsx` - OAuth callback handler
- `src/pages/api/auth/signin.ts` - Secure sign-in with cookie storage
- `src/pages/api/auth/session.ts` - Session validation and management
- `src/pages/api/auth/signout.ts` - Secure sign-out with cookie cleanup
- `src/components/TokenLogin.tsx` - Updated login UI with OAuth integration
- `src/components/SessionStatus.tsx` - Session status and expiration warnings
- `src/lib/auth.ts` - Authentication utilities and middleware

### Type System (src/types/anilist.ts)
- Comprehensive TypeScript definitions for AniList API
- Key types: `User`, `MediaList`, `Media`, `MediaType`, `MediaListStatus`
- Enums for media types, statuses, formats, and scoring systems

## Development Guidelines

### Working with Media Lists
- Always use the store's `getCurrentLists()` method to get current media data
- Apply filters through `applyFilters()` after state changes
- Use `updateMediaListEntry()` to update individual entries
- Bulk operations should use the rate limiter

### Bulk Operations
- Enable bulk mode via `setBulkEditMode(true)`
- Use `selectedEntries` Set for tracking selections
- Implement progress tracking for bulk operations
- Handle rate limiting and API errors gracefully

### State Updates
- Use Zustand actions for all state modifications
- Call `applyFilters()` after updating media lists
- Clear selections when switching between anime/manga views
- Persist only essential data to avoid localStorage quota issues

### API Rate Limiting
- Use the `RateLimiter` class for all AniList API calls
- Default configuration is conservative (0.5 requests/second)
- Implement proper error handling for rate limit responses
- Show progress indicators for bulk operations

### Error Handling
- Use the store's notification system for user feedback
- Implement retry logic for transient failures
- Handle authentication errors by redirecting to login
- Log errors for debugging but don't expose sensitive information

## Environment Variables

Optional configuration for enhanced functionality:
```env
# AniList OAuth Client ID (optional, enables seamless OAuth login)
NEXT_PUBLIC_ANILIST_CLIENT_ID=your_client_id_here

# AniList API Endpoint (optional, defaults to https://graphql.anilist.co)
ANILIST_API_URL=https://graphql.anilist.co

# Environment (affects cookie security settings)
NODE_ENV=development
```

### OAuth Setup (Optional but Recommended)
1. Create an AniList OAuth application at [AniList Developer Settings](https://anilist.co/settings/developer)
2. Set redirect URI to: `{your-domain}/auth/callback`
3. Copy the Client ID to `NEXT_PUBLIC_ANILIST_CLIENT_ID` environment variable
4. Users can now use seamless OAuth login in addition to manual token entry

**Authentication Fallback**: Manual token entry is always available, requiring no environment setup.

## Common Patterns

### Adding New Filters
1. Update `FilterOptions` interface in store
2. Add filter logic to `applyFilters()` method
3. Update FilterPanel component UI
4. Test with different media types

### Implementing New Bulk Operations
1. Add operation to `BulkEditOptions` interface
2. Update `bulkUpdateMediaListEntries()` in AniList client
3. Add UI controls in BulkEditPanel
4. Implement progress tracking and error handling

### State Debugging
- Use browser dev tools to inspect Zustand store
- Check console logs for filter application details
- Monitor rate limiter stats for API usage
- Use the debug panel if available