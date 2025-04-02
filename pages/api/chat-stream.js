import chatbot from '../../lib/chatbot';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  // This endpoint only accepts GET requests for SSE
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    const { message, startNew } = req.query; // Read startNew query param
    const startNewConversation = startNew === 'true'; // Convert to boolean
    
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
    
    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform, no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable buffering in Nginx
    });
    
    // Send initial message
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);
    
    // Force flush the initial messages
    if (res.flush) {
      try {
        res.flush();
      } catch (flushError) {
        console.warn("Error flushing start message:", flushError);
      }
    }
    
    // Create a callback function to handle streaming chunks
    const streamCallback = (chunk) => {
      try {
        const chunkData = JSON.stringify(chunk);
        res.write(`data: ${chunkData}\n\n`);
      } catch (writeError) {
        console.error("Error writing chunk to response:", writeError);
      }
      
      // Flush the response to ensure chunks are sent immediately
      if (res.flush) {
        try {
          res.flush();
        } catch (flushError) {
          console.warn("Error flushing response:", flushError);
        }
      }
    };
    
    try {
      // Call the chatbot with streaming enabled
      await chatbot(message, userId, accessToken, streamCallback, startNewConversation);
      
      // Add a small delay before sending the end message to ensure all processing steps are visible
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Send completion message
      const endMessage = JSON.stringify({ type: 'end' });
      res.write(`data: ${endMessage}\n\n`);
      
      // Final flush before ending
      if (res.flush) {
        try {
          res.flush();
        } catch (flushError) {
          console.warn("Error flushing final response:", flushError);
        }
      }
      
      // Add another small delay before ending the response
      await new Promise(resolve => setTimeout(resolve, 300));
      
      res.end();
    } catch (error) {
      // Send error message
      console.error("Error in chat-stream processing:", error);
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
      // Flush error message
      if (res.flush) {
        try {
          res.flush();
        } catch (flushError) {
          console.warn("Error flushing error response:", flushError);
        }
      }
      res.end();
    }
  } catch (error) {
    console.error('Error in chat-stream API:', error);
    return res.status(500).json({ error: 'An error occurred while processing your request' });
  }
}