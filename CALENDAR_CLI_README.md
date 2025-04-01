# Google Calendar CLI Tools

This directory contains CLI tools for testing Google Calendar API functionality.

## Setup

1. Make sure you have the required environment variables in your `.env` file:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_ACCESS_TOKEN=your-access-token
   GOOGLE_REFRESH_TOKEN=your-refresh-token
   ```

2. If you don't have access tokens yet, run the `get-tokens.js` script:
   ```
   node get-tokens.js
   ```
   This will:
   - Open a browser window for you to authorize the application
   - Save the tokens to a `tokens.txt` file
   - Display instructions for adding the tokens to your `.env` file

## Available Tools

### 1. Event Deletion Tool

The `test-delete.js` script allows you to:
1. View your upcoming calendar events
2. Select an event to delete by number
3. Confirm and delete the selected event

To run:
```
node test-delete.js
```

## Troubleshooting

- If you get authentication errors, your access token may have expired. Run `get-tokens.js` again to get a new token.
- Make sure your Google Cloud project has the Google Calendar API enabled.
- Ensure your OAuth consent screen is properly configured with the necessary scopes.