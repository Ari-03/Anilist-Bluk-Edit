# AGENTS.md

Guidelines for AI agents working on the AniList Bulk Edit codebase.

## Build/Lint/Test Commands

```bash
# Development
npm run dev          # Start development server on localhost:3000
npm run build        # Build production application
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint (Next.js config)
npm run type-check   # Run TypeScript type checking (tsc --noEmit)

# Pre-commit checklist
npm run lint && npm run type-check
```

**Note:** No test framework is currently configured. When adding tests, consider Jest with React Testing Library.

## Project Structure

```
src/
  components/     # React components (PascalCase filenames)
  contexts/       # React context providers
  lib/            # Utilities, API clients, helpers (camelCase filenames)
  pages/          # Next.js pages and API routes
  store/          # Zustand store definitions
  types/          # TypeScript type definitions
```

## Code Style Guidelines

### Imports

Use path aliases defined in `tsconfig.json`:

```typescript
// Path aliases (preferred)
import { User, MediaList } from '@/types/anilist'
import { useStore } from '@/store'
import { AniListClient } from '@/lib/anilist'
import BulkEditPanel from '@/components/BulkEditPanel'

// Import order:
// 1. External packages (react, next, third-party)
// 2. Internal types (@/types/*)
// 3. Internal utilities (@/lib/*)
// 4. Store (@/store/*)
// 5. Components (@/components/*)
```

### Formatting

- **Indentation:** 4 spaces
- **Quotes:** Single quotes for imports, double quotes in JSX attributes
- **Semicolons:** Optional (codebase has mixed usage, be consistent within files)
- **Line length:** No strict limit, but keep readable (~100-120 chars)
- **Trailing commas:** Use in multiline arrays/objects

### TypeScript

TypeScript strict mode is enabled. Follow these patterns:

```typescript
// Interfaces for object shapes
export interface User {
    id: number;
    name: string;
    avatar?: {           // Optional properties use ?
        large?: string;
        medium?: string;
    };
}

// Enums for fixed value sets
export enum MediaListStatus {
    CURRENT = 'CURRENT',
    PLANNING = 'PLANNING',
    COMPLETED = 'COMPLETED',
    DROPPED = 'DROPPED',
    PAUSED = 'PAUSED',
    REPEATING = 'REPEATING'
}

// Record for dynamic key objects
customLists?: Record<string, boolean>;

// Type unions for specific values
type SortOrder = 'asc' | 'desc'

// Generic constraints
async execute<T>(requestFn: () => Promise<T>): Promise<T>
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| React Components | PascalCase | `BulkEditPanel`, `MediaListView` |
| Component files | PascalCase.tsx | `BulkEditPanel.tsx` |
| Utility files | camelCase.ts | `rateLimiter.ts`, `anilist.ts` |
| Interfaces/Types | PascalCase | `MediaList`, `FilterOptions` |
| Enums | PascalCase | `MediaType`, `ScoreFormat` |
| Functions/Methods | camelCase | `getCurrentUser()`, `applyFilters()` |
| Variables | camelCase | `selectedEntries`, `isLoading` |
| Constants | camelCase or UPPER_SNAKE | `maxRetries`, `ANILIST_API_URL` |
| CSS classes | kebab-case (Tailwind) | `bg-blue-500`, `dark:text-white` |

### React Components

```typescript
// Props interface above component
interface BulkEditPanelProps {
    client: AniListClient | null
}

// Functional component with explicit return
export default function BulkEditPanel({ client }: BulkEditPanelProps) {
    // Hooks at top
    const { selectedEntries, bulkEditMode } = useStore()
    const [isProcessing, setIsProcessing] = useState(false)

    // Event handlers
    const handleBulkOperation = async () => {
        // ...
    }

    // Early returns for conditional rendering
    if (!bulkEditMode) {
        return <div>...</div>
    }

    return <div>...</div>
}
```

### State Management (Zustand)

```typescript
// Use the store hook with destructuring
const { user, setUser, addNotification } = useStore()

// Access store outside React components
useStore.getState().fetchMediaLists(userId, type, true)

// State updates via actions only
setBulkEditMode(true)
addNotification({ type: 'success', message: 'Done!' })
```

### Error Handling

```typescript
// API calls with proper error handling
try {
    const result = await client.updateMediaListEntry(mediaId, updates)
    addNotification({ type: 'success', message: 'Updated!' })
} catch (error: any) {
    console.error('Update failed:', error)
    
    // Handle specific error types
    if (error.status === 401) {
        // Authentication error
    } else if (error.status === 429) {
        // Rate limit - implement backoff
    }
    
    addNotification({ type: 'error', message: error.message || 'Failed' })
}

// Exponential backoff for retries
const delay = Math.pow(2, retryCount) * 1000
await new Promise(resolve => setTimeout(resolve, delay))
```

### API Routes (Next.js)

```typescript
// src/pages/api/auth/signin.ts
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Method validation
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Input validation
    const { token } = req.body
    if (!token) {
        return res.status(400).json({ error: 'Token is required' })
    }

    try {
        // Business logic
        return res.status(200).json({ success: true, data })
    } catch (error) {
        console.error('Handler error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
```

### GraphQL Queries

```typescript
// Inline GraphQL with template literals
const query = `
    query GetCurrentUser {
        Viewer {
            id
            name
            avatar { large medium }
        }
    }
`

// Variables passed separately
const variables = { userId, type, status }
const data = await this.request<ResponseType>(query, variables)
```

### Styling (Tailwind CSS)

```typescript
// Use Tailwind utility classes
<div className="card p-4 space-y-4">
    <button className="btn-primary flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Processing...
    </button>
</div>

// Dark mode with class strategy
<p className="text-gray-900 dark:text-white">...</p>

// Dynamic classes with template literals
className={`bg-${status.toLowerCase()}-500`}
```

### Rate Limiting

Always use the `RateLimiter` class for AniList API calls:

```typescript
const rateLimiter = new RateLimiter({
    maxRequestsPerSecond: 0.5,  // AniList limit: 30/min
    maxConcurrentRequests: 2,
    maxRetries: 3,
    initialRetryDelay: 2000
})

const result = await rateLimiter.execute(async () => {
    return await client.updateMediaListEntry(mediaId, updates)
})
```

## Common Pitfalls

1. **Don't bypass rate limiting** - Always use RateLimiter for AniList API calls
2. **Don't store sensitive data in localStorage** - Use httpOnly cookies via API routes
3. **Call `applyFilters()` after state changes** - Filters won't update automatically
4. **Clear selections when switching views** - Prevents stale selection state
5. **Handle authentication errors** - Redirect to login on 401 responses

## Environment Variables

```env
# Optional - enables OAuth login
NEXT_PUBLIC_ANILIST_CLIENT_ID=your_client_id

# Optional - image optimization
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id
```
