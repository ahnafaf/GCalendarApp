# Project Reorganization Plan

This document outlines a plan to reorganize the Google Calendar application's file structure to improve clarity, maintainability, and developer experience.

## Current Structure Issues

The current project structure has several issues:

1. Files with related functionality are scattered across different directories
2. Naming conventions are inconsistent and not always descriptive
3. Root directory contains many files that should be organized into folders
4. Authentication-related code is spread across multiple locations
5. The nested `gcalendarapp` directory creates confusion
6. Database-related files are mixed with other functionality

## Proposed New Structure

```
/
├── README.md
├── package.json
├── package-lock.json
├── .gitignore
├── aws-architecture-plan.md
├── next.config.js                  # New: Next.js configuration
│
├── src/                            # New: All source code moves here
│   ├── pages/                      # Moved from /pages
│   │   ├── _app.js
│   │   ├── index.js
│   │   ├── about.js
│   │   ├── chat.js
│   │   ├── contact.js
│   │   ├── features.js
│   │   │
│   │   └── api/                    # API routes
│   │       ├── chat.js
│   │       ├── events.js
│   │       │
│   │       └── auth/               # Auth API routes
│   │           ├── [...nextauth].js
│   │           ├── google.js
│   │           └── google/
│   │               └── callback.js
│   │
│   ├── components/                 # React components
│   │   ├── chat/                   # Chat-related components
│   │   │   └── ChatInterface.js    # Renamed from chat_component.js
│   │   │
│   │   ├── ui/                     # UI components
│   │   │   └── GridItem.js
│   │   │
│   │   └── layout/                 # Layout components
│   │       └── Header.js           # New component for consistent header
│   │
│   ├── styles/                     # CSS and styling
│   │   ├── global.css              # Renamed from styles.css
│   │   ├── chat.css
│   │   └── components/             # Component-specific styles
│   │       └── grid-item.css       # Example component-specific CSS
│   │
│   ├── services/                   # Service integrations
│   │   ├── calendar/               # Calendar-related services
│   │   │   ├── google-calendar.js  # Renamed from googleCalendar.js
│   │   │   └── calendar-actions.js # Renamed from calendarActions.js
│   │   │
│   │   ├── chat/                   # Chat-related services
│   │   │   └── chatbot.js          # Moved from lib/chatbot.js
│   │   │
│   │   └── auth/                   # Auth-related services
│   │       └── auth-service.js     # New file consolidating auth logic
│   │
│   ├── database/                   # Database-related code
│   │   ├── models/                 # Database models
│   │   │   ├── event.js            # Event model definition
│   │   │   └── session.js          # Session model definition
│   │   │
│   │   ├── db-client.js            # Renamed from database.js
│   │   ├── db-setup.js             # Renamed from dbSetup.js
│   │   └── init-db.js              # Renamed from initDb.js
│   │
│   ├── middleware/                 # Middleware functions
│   │   └── auth-middleware.js      # Renamed from auth.js
│   │
│   ├── utils/                      # Utility functions
│   │   ├── date-utils.js           # Date formatting and manipulation
│   │   └── api-utils.js            # API helper functions
│   │
│   └── config/                     # Configuration files
│       ├── auth-config.js          # Auth configuration
│       └── api-config.js           # API configuration
│
├── public/                         # Static assets
│   ├── images/
│   ├── icons/
│   └── favicon.ico
│
└── scripts/                        # Utility scripts
    └── setup-db.js                 # Database setup script
```

## File Renaming and Reorganization Details

### 1. Root Level Files

| Current File | New Location | New Name | Notes |
|--------------|--------------|----------|-------|
| googleCalendar.js | src/services/calendar/ | google-calendar.js | More descriptive, kebab-case |
| calendarActions.js | src/services/calendar/ | calendar-actions.js | More descriptive, kebab-case |
| database.js | src/database/ | db-client.js | Clearer purpose |
| dbSetup.js | src/database/ | db-setup.js | Consistent naming |
| initDb.js | src/database/ | init-db.js | Consistent naming |
| awards.csv | data/ | awards.csv | Move data files to data directory |

### 2. Directory Reorganization

| Current Directory | New Location | Notes |
|-------------------|--------------|-------|
| pages/ | src/pages/ | Standard Next.js convention |
| components/ | src/components/ | Organized into subdirectories by purpose |
| lib/ | src/services/ | More descriptive name for the functionality |
| middleware/ | src/middleware/ | Consistent with new structure |
| auth/ | src/services/auth/ | Consolidated auth services |

### 3. New Directories

| New Directory | Purpose |
|---------------|---------|
| src/ | Contains all source code |
| src/utils/ | Utility functions |
| src/config/ | Configuration files |
| src/styles/ | CSS and styling |
| public/ | Static assets |
| scripts/ | Utility scripts |
| data/ | Data files |

### 4. The `gcalendarapp` Directory

The `gcalendarapp` directory appears to be a separate application or bot framework. Options:

1. **Integrate**: If it's an integral part of the main application, refactor and integrate its functionality into the main src/ structure.
2. **Separate**: If it's a separate service, keep it as a separate directory but rename to `bot-service/` for clarity.
3. **Remove**: If it's deprecated or no longer used, consider removing it.

## Implementation Plan

1. **Create New Directory Structure**: Set up the new directories without moving files yet
2. **Move and Rename Files**: Systematically move and rename files according to the plan
3. **Update Imports**: Update all import statements to reflect new file locations
4. **Test**: Ensure the application still works after reorganization
5. **Clean Up**: Remove any empty directories or unused files

## Benefits of New Structure

1. **Clarity**: Clear separation of concerns and purpose for each file and directory
2. **Maintainability**: Related files are grouped together
3. **Scalability**: Structure can accommodate growth without becoming unwieldy
4. **Consistency**: Consistent naming conventions and organization
5. **Discoverability**: Easier for new developers to understand the project structure
6. **Standards**: Follows common industry practices and Next.js conventions

Would you like to proceed with this reorganization plan or would you like to make any adjustments?