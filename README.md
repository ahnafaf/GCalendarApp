# Google Calendar AI Chatbot

A Next.js application that integrates with Google Calendar and uses OpenAI's GPT-4o for natural language processing. Users can chat with an AI assistant to manage their Google Calendar events.

## Features

- **Google Authentication**: Secure login with Google OAuth
- **AI-Powered Chat**: Natural language interaction with your calendar
- **Calendar Integration**: View, add, update, and delete events
- **Smart Scheduling**: Find available time slots based on your preferences
- **Conflict Detection**: Automatically detect and resolve scheduling conflicts

## Technologies Used

- **Next.js**: React framework for server-rendered applications
- **NextAuth.js**: Authentication for Next.js applications
- **OpenAI API**: GPT-4o for natural language processing
- **Google Calendar API**: Calendar integration
- **SQLite**: Local database for caching calendar events
- **Sequelize**: ORM for database operations

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- Google Cloud Platform account with Calendar API enabled
- OpenAI API key

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```
OPENAI_API_KEY=your_openai_api_key
MONGODB_URI=mongodb://localhost:27017/gCalendarData
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_URL=http://localhost:3000
```

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Initialize the database:
   ```
   npm run init-db
   ```
4. Start the development server:
   ```
   npm run dev
   ```

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Click "Sign in with Google" to authenticate
3. Once authenticated, you'll be redirected to the chat page
4. Start chatting with the AI assistant to manage your calendar

Example commands:
- "Schedule a meeting for tomorrow at 2 PM"
- "What events do I have next week?"
- "Cancel my appointment on Friday"

## Project Structure

- `/auth`: Authentication configuration
- `/components`: React components
- `/lib`: Utility functions and chatbot implementation
- `/middleware`: Authentication middleware
- `/pages`: Next.js pages and API routes
- `/public`: Static assets

## License

This project is licensed under the ISC License.
