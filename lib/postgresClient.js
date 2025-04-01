import { Sequelize, DataTypes } from 'sequelize';
import 'dotenv/config';

// Create PostgreSQL connection
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  username: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'gcalendarapp',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  dialectOptions: {
    ssl: process.env.POSTGRES_SSL === 'true' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Define models based on the provided schema
const User = sequelize.define('User', {
  user_id: {
    type: DataTypes.UUID,
    defaultValue: Sequelize.literal('uuid_generate_v4()'),
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  name: DataTypes.STRING(255),
  avatar_url: DataTypes.TEXT,
  auth_provider: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  auth_provider_id: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  timezone: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'UTC'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  }
}, {
  tableName: 'users',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['auth_provider', 'auth_provider_id']
    }
  ]
});

const UserPreference = sequelize.define('UserPreference', {
  preference_id: {
    type: DataTypes.UUID,
    defaultValue: Sequelize.literal('uuid_generate_v4()'),
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    },
    onDelete: 'CASCADE'
  },
  preferences_data: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  }
}, {
  tableName: 'user_preferences',
  timestamps: false,
  indexes: [
    {
      fields: ['user_id']
    }
  ]
});

const Conversation = sequelize.define('Conversation', {
  conversation_id: {
    type: DataTypes.UUID,
    defaultValue: Sequelize.literal('uuid_generate_v4()'),
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    },
    onDelete: 'CASCADE'
  },
  start_time: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  },
  summary: DataTypes.TEXT,
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  }
}, {
  tableName: 'conversations',
  timestamps: false,
  indexes: [
    {
      fields: ['user_id']
    }
  ]
});
const ConversationMessage = sequelize.define('ConversationMessage', {
  message_id: {
    type: DataTypes.UUID,
    defaultValue: Sequelize.literal('uuid_generate_v4()'),
    primaryKey: true
  },
  conversation_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'conversations',
      key: 'conversation_id'
    },
    onDelete: 'CASCADE'
  },
  sequence_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['user', 'assistant', 'system', 'tool']]
    }
  },
  content: {
    type: DataTypes.TEXT,
    // Allow null content for assistant messages that ONLY make tool calls
    allowNull: true // CHANGED: Allow null content
  },
  // --- NEW/MODIFIED Fields ---
  tool_calls: {
    type: DataTypes.JSONB, // Store the full tool_calls array from the assistant
    allowNull: true
  },
  tool_call_id: { // Keep this ONLY for 'tool' role messages to link response
    type: DataTypes.TEXT,
    allowNull: true
  },
  // --- REMOVED Fields (redundant if tool_calls is stored) ---
  // tool_call_name: DataTypes.TEXT,
  // tool_call_args: DataTypes.JSONB,
  // tool_response_content: DataTypes.TEXT, // Content field is used for tool response

  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  }
}, {
  tableName: 'conversation_messages',
  timestamps: false, // Assuming you handle timestamps manually or via triggers
  indexes: [
    // Keep existing indexes if they make sense
    { fields: ['conversation_id', 'created_at'] },
    { fields: ['conversation_id', 'sequence_number'] },
    // Add index for tool_call_id if needed for lookups
    { fields: ['tool_call_id'] }
  ]
});



const CalendarEventMetadata = sequelize.define('CalendarEventMetadata', {
  metadata_id: {
    type: DataTypes.UUID,
    defaultValue: Sequelize.literal('uuid_generate_v4()'),
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    },
    onDelete: 'CASCADE'
  },
  google_calendar_id: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: 'primary'
  },
  google_event_id: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  priority: {
    type: DataTypes.STRING(20),
    validate: {
      isIn: [['Low', 'Medium', 'High', 'Urgent']]
    }
  },
  deadline: DataTypes.DATE,
  task_status: {
    type: DataTypes.STRING(30),
    validate: {
      isIn: [['Not Started', 'In Progress', 'Completed', 'Blocked', 'Deferred']]
    }
  },
  event_summary_cached: DataTypes.TEXT,
  start_time_cached: DataTypes.DATE,
  end_time_cached: DataTypes.DATE,
  location_cached: DataTypes.TEXT,
  last_synced_at: DataTypes.DATE,
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.literal('NOW()')
  }
}, {
  tableName: 'calendar_event_metadata',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'google_calendar_id', 'google_event_id']
    },
    {
      fields: ['user_id', 'deadline']
    },
    {
      fields: ['user_id', 'priority']
    }
  ]
});

// Define relationships
User.hasMany(Conversation, { foreignKey: 'user_id' });
Conversation.belongsTo(User, { foreignKey: 'user_id' });

User.hasOne(UserPreference, { foreignKey: 'user_id' });
UserPreference.belongsTo(User, { foreignKey: 'user_id' });

Conversation.hasMany(ConversationMessage, { foreignKey: 'conversation_id' });
ConversationMessage.belongsTo(Conversation, { foreignKey: 'conversation_id' });

User.hasMany(CalendarEventMetadata, { foreignKey: 'user_id' });
CalendarEventMetadata.belongsTo(User, { foreignKey: 'user_id' });

// Helper functions for conversation management
async function initializeDatabase() {
  try {
    // Test connection
    try {
      await sequelize.authenticate();
      console.log('PostgreSQL connection has been established successfully.');
    } catch (error) {
      console.error('Unable to connect to the database:', error);
      console.log('Make sure PostgreSQL is running and the database exists.');
      console.log('You can create the database by running: npm run init-postgres');
      throw new Error('Database connection failed. See above for details.');
    }

    try {
      // Create extension for UUID generation if it doesn't exist
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
      console.log('UUID extension enabled successfully.');
    } catch (error) {
      console.error('Error creating UUID extension:', error);
      throw error;
    }

    try {
      // Create timestamp trigger function if it doesn't exist
      await sequelize.query(`
        CREATE OR REPLACE FUNCTION trigger_set_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      console.log('Timestamp trigger function created successfully.');
    } catch (error) {
      console.error('Error creating timestamp trigger function:', error);
      throw error;
    }

    try {
      // Sync all models without force: true to avoid dropping tables
      console.log('Synchronizing models (non-destructive)...');
      // Use { alter: true } to apply schema changes non-destructively
      await sequelize.sync({ alter: true });
      console.log('All models were synchronized successfully.');
      
      // Note: For production, database structure should be managed via migrations
      // rather than automatic sync
    } catch (error) {
      console.error('Error synchronizing models:', error);
      throw error;
    }
    
    try {
      // Check if tool_calls column exists in conversation_messages table
      const checkColumnResult = await sequelize.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'conversation_messages'
        AND column_name = 'tool_calls';
      `);
      
      // If column doesn't exist, add it
      if (checkColumnResult[0].length === 0) {
        console.log('Adding missing tool_calls column to conversation_messages table...');
        await sequelize.query(`
          ALTER TABLE conversation_messages
          ADD COLUMN tool_calls JSONB;
        `);
        console.log('tool_calls column added successfully.');
      } else {
        console.log('tool_calls column already exists in conversation_messages table.');
      }
    } catch (error) {
      console.error('Error checking or adding tool_calls column:', error);
      throw error;
    }

    try {
      // Create triggers for updated_at timestamps
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_users') THEN
            CREATE TRIGGER set_timestamp_users
            BEFORE UPDATE ON users
            FOR EACH ROW
            EXECUTE FUNCTION trigger_set_timestamp();
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_user_preferences') THEN
            CREATE TRIGGER set_timestamp_user_preferences
            BEFORE UPDATE ON user_preferences
            FOR EACH ROW
            EXECUTE FUNCTION trigger_set_timestamp();
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_conversations') THEN
            CREATE TRIGGER set_timestamp_conversations
            BEFORE UPDATE ON conversations
            FOR EACH ROW
            EXECUTE FUNCTION trigger_set_timestamp();
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_calendar_event_metadata') THEN
            CREATE TRIGGER set_timestamp_calendar_event_metadata
            BEFORE UPDATE ON calendar_event_metadata
            FOR EACH ROW
            EXECUTE FUNCTION trigger_set_timestamp();
          END IF;
        END
        $$;
      `);
      console.log('Database triggers created successfully.');
    } catch (error) {
      console.error('Error creating triggers:', error);
      throw error;
    }

    console.log('Database initialization completed successfully.');
  } catch (error) {
    console.error('Unable to initialize database:', error);
    throw error;
  }
}

// Conversation management functions
async function getOrCreateUser(email, name, authProvider, authProviderId, avatarUrl = null) {
  try {
    // First try to find the user by email
    let user = await User.findOne({ where: { email } });
    
    if (user) {
      // User exists, check if we need to update auth provider info
      if (user.auth_provider !== authProvider || user.auth_provider_id !== authProviderId) {
        // Only update if the auth provider info is different
        console.log(`User with email ${email} exists but with different auth provider. Returning existing user.`);
      }
      return user;
    }
    
    // User doesn't exist, create a new one
    user = await User.create({
      email,
      name,
      auth_provider: authProvider,
      auth_provider_id: authProviderId,
      avatar_url: avatarUrl
    });
    
    return user;
  } catch (error) {
    console.error('Error getting or creating user:', error);
    throw error;
  }
}

async function createConversation(userId) {
  try {
    // Check if userId is an email address
    const isEmail = typeof userId === 'string' && userId.includes('@');
    let actualUserId = userId;
    
    // If userId is an email, find the user by email first to get the actual UUID
    if (isEmail) {
      const userByEmail = await User.findOne({ where: { email: userId } });
      if (!userByEmail) {
        console.log(`No user found with email: ${userId}`);
        throw new Error(`Cannot create conversation: No user found with email: ${userId}`);
      }
      actualUserId = userByEmail.user_id;
    }
    
    const conversation = await Conversation.create({
      user_id: actualUserId
    });
    return conversation;
  } catch (error) {
    console.error('Error creating conversation:', error);
    throw error;
  }
}

async function getConversation(conversationId) {
  try {
    return await Conversation.findByPk(conversationId, {
      include: [
        {
          model: ConversationMessage,
          order: [['sequence_number', 'ASC']]
        }
      ]
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    throw error;
  }
}

async function getConversationsByUserId(userId) {
  try {
    // Check if userId is an email address
    const isEmail = typeof userId === 'string' && userId.includes('@');
    let actualUserId = userId;
    
    // If userId is an email, find the user by email first to get the actual UUID
    if (isEmail) {
      const userByEmail = await User.findOne({ where: { email: userId } });
      if (!userByEmail) {
        console.log(`No user found with email: ${userId}`);
        return [];
      }
      actualUserId = userByEmail.user_id;
    }
    
    // Use EXPLAIN ANALYZE to understand query performance
    if (process.env.NODE_ENV === 'development') {
      const explainResult = await sequelize.query(`
        EXPLAIN ANALYZE
        SELECT * FROM conversations
        WHERE user_id = '${actualUserId}'
        ORDER BY created_at DESC
      `);
      console.log('Query execution plan:', explainResult[0]);
    }
    
    return await Conversation.findAll({
      where: { user_id: actualUserId },
      order: [['created_at', 'DESC']]
    });
  } catch (error) {
    console.error('Error getting conversations by user ID:', error);
    throw error;
  }
}

async function getConversationMessages(conversationId) {
  try {
    return await ConversationMessage.findAll({
      where: { conversation_id: conversationId },
      order: [['sequence_number', 'ASC']]
    });
  } catch (error) {
    console.error('Error getting conversation messages:', error);
    throw error;
  }
}


async function addMessageToConversation(
  conversationId,
  role,
  content, // Can be null/undefined for assistant tool calls
  { tool_calls = null, tool_call_id = null } = {} // Pass tool info as an object
) {
  try {
    // Use a transaction for sequence number safety
    const result = await sequelize.transaction(async (t) => {
      // Get the next sequence number within the transaction
      const maxSequenceResult = await ConversationMessage.findOne({
        attributes: [[sequelize.fn('max', sequelize.col('sequence_number')), 'maxSequence']],
        where: { conversation_id: conversationId },
        transaction: t,
        raw: true, // Get raw result
      });
      const maxSequence = maxSequenceResult?.maxSequence || 0;

      // Create the message
      const message = await ConversationMessage.create({
        conversation_id: conversationId,
        sequence_number: maxSequence + 1,
        role,
        content: content, // Store content (can be null)
        tool_calls: role === 'assistant' ? tool_calls : null, // Store tool_calls ONLY for assistant
        tool_call_id: role === 'tool' ? tool_call_id : null, // Store tool_call_id ONLY for tool response
      }, { transaction: t });

      return message;
    });

    return result;

  } catch (error) {
    console.error('Error adding message to conversation:', error);
    // Log specific details if available
    if (error.original) {
        console.error('Original DB Error:', error.original);
    }
    throw error; // Re-throw the error to be handled upstream
  }
}



/**
 * Get user and their latest conversation in a single query
 * @param {string} userId - The user ID
 * @returns {Object} - User data with latest conversation
 */
async function getUserWithLatestConversation(userId) {
  try {
    // Check if userId is an email address
    const isEmail = typeof userId === 'string' && userId.includes('@');
    let actualUserId = userId;
    
    // If userId is an email, find the user by email first to get the actual UUID
    if (isEmail) {
      const userByEmail = await User.findOne({ where: { email: userId } });
      if (!userByEmail) {
        console.log(`No user found with email: ${userId}`);
        return null;
      }
      actualUserId = userByEmail.user_id;
    }
    
    // Use EXPLAIN ANALYZE to understand query performance
    if (process.env.NODE_ENV === 'development') {
      const explainResult = await sequelize.query(`
        EXPLAIN ANALYZE
        SELECT u.*, c.*
        FROM users u
        LEFT JOIN (
          SELECT * FROM conversations
          WHERE user_id = '${actualUserId}'
          ORDER BY created_at DESC
          LIMIT 1
        ) c ON u.user_id = c.user_id
        WHERE u.user_id = '${actualUserId}'
      `);
      console.log('Join query execution plan:', explainResult[0]);
    }
    
    // Execute the actual query using Sequelize
    const user = await User.findByPk(actualUserId, {
      include: [
        {
          model: Conversation,
          limit: 1,
          order: [['created_at', 'DESC']],
          include: [
            {
              model: ConversationMessage,
              order: [['sequence_number', 'DESC']],
              limit: 50, // Load up to 50 most recent messages
              separate: true // This ensures all messages are loaded, not just one
            }
          ]
        },
        {
          model: UserPreference
        }
      ]
    });
    
    return user;
  } catch (error) {
    console.error('Error getting user with latest conversation:', error);
    throw error;
  }
}

// Export models and functions
export {
  sequelize,
  User,
  UserPreference,
  Conversation,
  ConversationMessage,
  CalendarEventMetadata,
  initializeDatabase,
  getOrCreateUser,
  createConversation,
  getConversation,
  getConversationsByUserId,
  getConversationMessages,
  addMessageToConversation,
  getUserWithLatestConversation
};

export default sequelize;
