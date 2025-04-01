
// Import from the correct path
import { Conversation } from '../postgresClient.js';

export async function getConversationsByUserId(userId) {
  try {
    if (!userId) return [];
    return await Conversation.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
    });
  } catch (error) {
    console.error(`Error getting conversations for user ${userId}:`, error);
    return [];
  }
}
