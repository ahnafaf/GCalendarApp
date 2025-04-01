# Testing the New Project Structure

This document provides instructions on how to test the reorganized project structure.

## Structure Verification

To verify that all files and directories are in the correct places:

```bash
npm run test:structure
```

This will check that all expected files and directories exist in the new structure.

## Running the Application

### Option 1: Quick Test

To quickly test if the application can start with the new structure:

```bash
npm run test:run
```

This will start the application for 10 seconds to verify it can initialize properly.

### Option 2: Full Test

To fully test the application with the new structure:

```bash
npm run dev
```

This will start the Next.js development server using the new structure.

## Next Steps

Before the application will work correctly with the new structure, you'll need to:

1. **Update Import Paths**: All import paths in the files need to be updated to reflect the new structure.

2. **Test Functionality**: After updating imports, test all functionality to ensure everything works correctly.

3. **AWS Deployment**: Once the reorganization is complete and tested, proceed with implementing the AWS serverless architecture.

## Import Path Updates

Here are some examples of how import paths need to be updated:

### Before:

```javascript
import Chat from '../components/chat_component';
import { setupGoogleCalendar } from '../../googleCalendar';
import { withAuth } from '../../middleware/auth';
```

### After:

```javascript
import Chat from '../components/chat/ChatInterface';
import { setupGoogleCalendar } from '../services/calendar/google-calendar';
import { withAuth } from '../middleware/auth-middleware';
```

## Structure Overview

The new project structure follows this organization:

```
/
├── src/                            # All source code
│   ├── components/                 # React components
│   │   ├── chat/                   # Chat-related components
│   │   ├── layout/                 # Layout components
│   │   └── ui/                     # UI components
│   │
│   ├── config/                     # Configuration files
│   ├── database/                   # Database-related code
│   │   └── models/                 # Database models
│   │
│   ├── middleware/                 # Middleware functions
│   ├── pages/                      # Next.js pages
│   │   └── api/                    # API routes
│   │
│   ├── services/                   # Service integrations
│   │   ├── auth/                   # Auth-related services
│   │   ├── calendar/               # Calendar-related services
│   │   └── chat/                   # Chat-related services
│   │
│   ├── styles/                     # CSS and styling
│   └── utils/                      # Utility functions
│
├── public/                         # Static assets
├── scripts/                        # Utility scripts
└── data/                           # Data files
```

This structure provides better organization, maintainability, and follows standard Next.js conventions.