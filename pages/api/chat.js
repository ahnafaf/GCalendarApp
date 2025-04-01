// pages/api/chat.js
import chatbot from '../../lib/chatbot';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    const { message, stream = true } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if user is authenticated
    if (!session) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if token has an error (failed refresh)
    if (session.error === 'RefreshAccessTokenError') {
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    }

    // Get user ID from session
    const userId = session.user?.email || 'default';
    
    // Get access token from session
    const accessToken = session.accessToken;
    
    // If streaming is requested
    if (stream) {
      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });
      
      // Send initial message
      res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);
      
      // Create a callback function to handle streaming chunks
      const streamCallback = (chunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        // Flush the response to ensure chunks are sent immediately
        if (res.flush) res.flush();
      };
      
      try {
        // Call the chatbot with streaming enabled
        await chatbot(message, userId, accessToken, streamCallback);
        
        // Send completion message
        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
        res.end();
      } catch (error) {
        // Send error message
        res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
        res.end();
      }
    } else {
      // Non-streaming mode
      const response = await chatbot(message, userId, accessToken);
      return res.status(200).json({ response });
    }
  } catch (error) {
    console.error('Error in chat API:', error);
    return res.status(500).json({ error: 'An error occurred while processing your request' });
  }
}
