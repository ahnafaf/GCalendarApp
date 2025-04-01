import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/[...nextauth]';
import { setupGoogleCalendar } from '../googleCalendar';

export function withAuth(handler) {
  return async (req, res) => {
    try {
      const session = await getServerSession(req, res, authOptions);

      if (!session) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Set up Google Calendar with the access token from the session
      setupGoogleCalendar({ access_token: session.accessToken });

      // Add the session to the request object for use in the handler
      req.session = session;
      
      return handler(req, res);
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(500).json({ error: 'Authentication error' });
    }
  };
}
