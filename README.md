# AniList Bulk Edit

A powerful web application for efficiently managing your AniList anime and manga collections with bulk editing capabilities.

## Features

### 🚀 Core Functionality
- **OAuth2 Authentication** - Secure login with your AniList account
- **Bulk Operations** - Edit multiple entries simultaneously
- **Advanced Filtering** - Find specific entries with powerful filters
- **Real-time Updates** - Changes are immediately synced with AniList
- **Dark Mode** - Beautiful dark/light theme toggle

### 📊 Bulk Edit Operations
- Change status (Watching/Reading, Completed, Dropped, etc.)
- Update scores for multiple entries
- Modify progress (episodes watched/chapters read)
- Set priority levels
- Add or edit notes
- Update start/completion dates
- Manage custom lists
- Toggle privacy settings

### 🔍 Advanced Filtering & Search
- Filter by status, format, genre, year, score
- Full-text search across titles
- Sort by title, score, progress, dates
- Custom filter combinations
- Save filter presets

### 🎨 User Experience
- Responsive design for desktop and mobile
- Intuitive card-based interface
- Bulk selection with checkboxes
- Progress indicators and loading states
- Toast notifications for actions
- Rate limiting protection

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Authentication**: Custom token-based authentication with AniList personal access tokens
- **State Management**: Zustand with persistence
- **Styling**: Tailwind CSS with custom components
- **API**: GraphQL with AniList API
- **Icons**: Lucide React

## Setup Instructions

### Prerequisites
- Node.js 18 or higher
- AniList account

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd anilist-bulk-edit
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage Guide

### Getting Started
1. **Get Access Token**: Generate a personal access token from AniList
   - Go to [AniList Developer Settings](https://anilist.co/settings/developer)
   - Click "Create New Client" and note your Client ID
   - Visit: `https://anilist.co/api/v2/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=token`
   - Copy the access token from the URL after authorization
2. **Sign In**: Enter your personal access token on the login page
3. **Load Lists**: Your anime and manga lists will be automatically loaded

### Bulk Editing
1. **Enable Bulk Mode**: Click the "Bulk Edit" button in the toolbar
2. **Select Entries**: Use checkboxes to select multiple entries
3. **Choose Action**: Select what you want to change (status, score, etc.)
4. **Apply Changes**: Review and confirm your bulk operation
5. **Monitor Progress**: Watch as changes are applied with progress feedback

### Filtering and Search
- **Quick Filters**: Use the status tabs (Watching, Completed, etc.)
- **Advanced Filters**: Open the filter panel for detailed options
- **Search**: Type in the search box to find specific titles
- **Sorting**: Click column headers to sort by different criteria

### Managing Lists
- **Switch Types**: Toggle between Anime and Manga using the tabs
- **View Options**: Choose between grid and list views
- **Status Management**: Easily change entry statuses
- **Progress Tracking**: Update episode/chapter progress
- **Score Rating**: Rate your entries using your preferred scoring system

## Project Structure

```
src/
├── components/          # React components
│   ├── Layout.tsx      # Main layout wrapper
│   ├── MediaListView.tsx # Media list display
│   ├── BulkEditPanel.tsx # Bulk editing interface
│   ├── FilterPanel.tsx  # Filtering controls
│   └── ...
├── lib/                # Utilities and clients
│   └── anilist.ts      # AniList GraphQL client
├── pages/              # Next.js pages
│   ├── index.tsx       # Home page
│   ├── _app.tsx        # App wrapper
│   └── api/auth/       # NextAuth.js API routes
├── store/              # State management
│   └── index.ts        # Zustand store
├── styles/             # CSS styles
│   └── globals.css     # Global styles and Tailwind
└── types/              # TypeScript definitions
    └── anilist.ts      # AniList API types
```

## API Integration

### AniList GraphQL Queries
- **User Data**: Fetch current user information and preferences
- **Media Lists**: Retrieve complete anime/manga collections
- **Search**: Find media entries by title

### AniList GraphQL Mutations
- **Update Entry**: Modify individual media list entries
- **Bulk Updates**: Process multiple entries (with rate limiting)
- **Delete Entry**: Remove entries from lists

### Rate Limiting
The application implements intelligent rate limiting:
- Batches requests in groups of 5
- Adds delays between batches
- Fallback to individual requests if batch fails
- Progress tracking for bulk operations

## Features in Detail

### Bulk Edit Operations
The bulk edit system supports all major list modifications:

**Status Changes**
- Watching → Completed
- Planning → Watching
- Dropped → Completed
- And all other status transitions

**Score Updates**
- Supports all AniList scoring formats (100-point, 10-point, 5-star, etc.)
- Smart score conversion between formats
- Batch score assignment

**Progress Management**
- Episode/chapter progress updates
- Volume progress for manga
- Auto-completion when progress reaches maximum

**Advanced Options**
- Custom list management
- Priority settings
- Privacy toggles
- Note editing
- Date management

### Filtering System
Comprehensive filtering options:

**Basic Filters**
- Status (Watching, Completed, etc.)
- Media format (TV, Movie, Manga, etc.)
- Genre selection
- Release year range
- Score range

**Advanced Search**
- Title search (all languages)
- Tag-based filtering
- Studio filtering
- Advanced scoring criteria

**Sorting Options**
- Alphabetical (A-Z, Z-A)
- Score (High to Low, Low to High)
- Progress (Most to Least, Least to Most)
- Last Updated
- Start Date

## Development

### Adding New Features
1. Define TypeScript interfaces in `/src/types/`
2. Add GraphQL queries/mutations in `/src/lib/anilist.ts`
3. Update Zustand store in `/src/store/index.ts`
4. Create React components in `/src/components/`

### Code Style
- TypeScript for type safety
- Functional components with hooks
- Tailwind CSS for styling
- ESLint for code quality

### Testing
```bash
npm run lint          # Run ESLint
npm run type-check    # Run TypeScript checks
```

## Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Update `NEXTAUTH_URL` to your production domain
4. Update AniList OAuth redirect URL to production callback

### Docker
```bash
docker build -t anilist-bulk-edit .
docker run -p 3000:3000 anilist-bulk-edit
```

## Security Considerations

- OAuth2 tokens are stored securely using NextAuth.js
- No sensitive data is logged or exposed
- Rate limiting prevents API abuse
- HTTPS required for production
- Environment variables for all secrets

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [AniList](https://anilist.co) for providing the excellent API
- [Next.js](https://nextjs.org) for the React framework
- [NextAuth.js](https://next-auth.js.org) for authentication
- [Tailwind CSS](https://tailwindcss.com) for styling
- [Zustand](https://github.com/pmndrs/zustand) for state management

## Support

If you encounter issues:
1. Check the console for error messages
2. Verify your environment variables
3. Ensure your AniList OAuth app is configured correctly
4. Check AniList API status
5. Create an issue on GitHub with details

---

**Note**: This application is not affiliated with AniList. It's a third-party tool that uses the public AniList API. 