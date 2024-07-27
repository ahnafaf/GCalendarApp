# Google Calendar Assistant

## Overview

This project is a Node.js-based command-line application that integrates with Google Calendar, allowing users to manage their calendar events through natural language interactions. It uses OpenAI's GPT model to interpret user inputs and perform calendar operations.

Why use this?

- Contextual awareness: Plan your week using events. Allows you to get a sanity check on events you potentially might have missed.
- Natural Language Event Creation: Add events to your calendar using everyday language, making event creation quick and intuitive.
- Intelligent Scheduling: The assistant understands complex time-related requests, helping to schedule events efficiently based on your availability.
- Quick Event Modifications: Easily change event details like time, date, or participants without navigating through multiple menus.
- Effortless Event Retrieval: Quickly find out what's on your schedule for any given day, week, or month using simple queries.


## Features

- Add new events to Google Calendar
- Retrieve events from a specified date range
- Modify existing events
- Delete events
- Natural language processing for user inputs
- Conflict detection when adding new events
- Time zone awareness

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js (v12.0.0 or higher)
- npm (Node Package Manager)
- A Google Cloud Project with the Google Calendar API enabled
- OpenAI API key

## Installation

1. Clone the repository:
```
git clone https://github.com/ahnafaf/google-calendar-assistant.git
cd google-calendar-assistant
```

3. Install the dependencies:
```
npm install
```


4. Set up your Google Cloud Project and obtain the necessary credentials:
- Go to the [Google Cloud Console](https://console.cloud.google.com/)
- Create a new project or select an existing one
- Enable the Google Calendar API for your project
- Create credentials (OAuth 2.0 Client ID) for a desktop application
- Download the credentials JSON file and save it as `credentials.json` in the project root directory

4. Set up your OpenAI API key:
- Create a `.env` file in the project root
- Add your OpenAI API key to the `.env` file:
  ```
  OPENAI_API_KEY=your_api_key_here
  ```

## Usage

To start the application, run:
```
node main
```


On first run, you'll be prompted to authorize the application with your Google account. Follow the provided URL, grant the necessary permissions, and enter the authorization code when prompted.

Once authorized, you can interact with the assistant using natural language. Here are some example commands:

- "Add a meeting with John tomorrow at 2 PM"
- "What events do I have next week?"
- "Modify my 3 PM meeting to start at 4 PM"
- "Delete my dentist appointment"
- "Show me today's events"

Type 'exit' to quit the application.

## File Structure

- `main.js`: The entry point of the application. Contains the main chat loop and integration with OpenAI.
- `googleCalendar.js`: Handles all interactions with the Google Calendar API.
- `credentials.json`: Your Google Cloud Project credentials (not included in the repository).
- `token.json`: Stores the user's access and refresh tokens (auto-generated on first run).
- `.env`: Contains environment variables like the OpenAI API key.

## Configuration

The application uses the following environment variables:

- `OPENAI_API_KEY`: Your OpenAI API key

These should be set in the `.env` file.

## Troubleshooting

- If you encounter authentication issues, delete the `token.json` file and restart the application to re-authenticate.
- Ensure that your Google Cloud Project has the Google Calendar API enabled.
- Check that your `credentials.json` file is correctly placed in the project root directory.
- Verify that your OpenAI API key is correctly set in the `.env` file.

## Contributing

Contributions to this project are welcome. Please fork the repository and submit a pull request with your changes.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenAI for providing the GPT model
- Google for the Calendar API
- All contributors and users of this project



