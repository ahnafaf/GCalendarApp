import { withAuth } from '../../middleware/auth';
import { getCalendarEvents } from '../../googleCalendar';

async function handler(req, res) {
  const startDate = new Date(req.query.start || new Date());
  const endDate = new Date(req.query.end || new Date());
  endDate.setMonth(endDate.getMonth() + 1); // Default to one month from start

  try {
    const events = await getCalendarEvents(startDate, endDate);
    res.status(200).json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}

export default withAuth(handler);
