// lib/redisClient.js
import Redis from 'ioredis';
import NodeCache from 'node-cache';
import 'dotenv/config';

// Create Redis client with configuration from environment variables
// or use default values if not provided
const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || '',
  db: process.env.REDIS_DB || 0,
  // Enable reconnect on error
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Create a very short-lived first-level buffer cache
const localCache = new NodeCache({ stdTTL: 10 }); // 10 seconds TTL

// Log connection events
redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Helper functions for conversation history
const CONVERSATION_PREFIX = 'conversation:';
const CACHE_PREFIX = 'cache:';
const DATE_RANGE_PREFIX = 'date_range:';
const USER_PREFIX = 'user:';
const DEFAULT_EXPIRY = 60 * 60 * 24 * 7; // 1 week in seconds

/**
 * Save conversation history for a user
 * @param {string} userId - The user ID
 * @param {Array} messages - The conversation messages
 * @param {number} expiry - Expiry time in seconds (optional)
 */
export async function saveConversation(userId, messages, expiry = DEFAULT_EXPIRY) {
  try {
    const key = `${CONVERSATION_PREFIX}${userId}`;
    await redisClient.set(key, JSON.stringify(messages), 'EX', expiry);
  } catch (error) {
    console.error('Error saving conversation to Redis:', error);
  }
}

/**
 * Get conversation history for a user
 * @param {string} userId - The user ID
 * @returns {Array|null} - The conversation messages or null if not found
 */
export async function getConversation(userId) {
  try {
    const key = `${CONVERSATION_PREFIX}${userId}`;
    
    // Try local cache first
    const localData = localCache.get(key);
    if (localData) {
      return localData;
    }
    
    // Try Redis
    const data = await redisClient.get(key);
    if (data) {
      const parsedData = JSON.parse(data);
      // Store in local cache
      localCache.set(key, parsedData);
      return parsedData;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting conversation from Redis:', error);
    return null;
  }
}

/**
 * Delete conversation history for a user
 * @param {string} userId - The user ID
 */
export async function deleteConversation(userId) {
  try {
    const key = `${CONVERSATION_PREFIX}${userId}`;
    await redisClient.del(key);
    localCache.del(key);
  } catch (error) {
    console.error('Error deleting conversation from Redis:', error);
  }
}

// Helper functions for caching
/**
 * Set a value in the cache
 * @param {string} key - The cache key
 * @param {any} value - The value to cache
 * @param {number} expiry - Expiry time in seconds (optional)
 */
export async function setCache(key, value, expiry = 300) { // Default 5 minutes
  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    await redisClient.set(cacheKey, JSON.stringify(value), 'EX', expiry);
    localCache.set(cacheKey, value, 10); // 10 seconds in local cache
  } catch (error) {
    console.error('Error setting cache in Redis:', error);
  }
}

/**
 * Get a value from the cache
 * @param {string} key - The cache key
 * @returns {any|null} - The cached value or null if not found
 */
export async function getCache(key) {
  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    
    // Try local cache first (fastest)
    const localData = localCache.get(cacheKey);
    if (localData) {
      return localData;
    }
    
    // Try Redis
    const data = await redisClient.get(cacheKey);
    if (data) {
      const parsedData = JSON.parse(data);
      // Store in local cache
      localCache.set(cacheKey, parsedData, 10); // 10 seconds
      return parsedData;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting cache from Redis:', error);
    return null;
  }
}

/**
 * Delete a value from the cache
 * @param {string} key - The cache key
 */
export async function deleteCache(key) {
  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    await redisClient.del(cacheKey);
    localCache.del(cacheKey);
  } catch (error) {
    console.error('Error deleting cache from Redis:', error);
  }
}

/**
 * Delete all cache entries with a specific prefix
 * @param {string} prefix - The prefix to match
 */
export async function deleteCacheByPrefix(prefix) {
  try {
    const pattern = `${CACHE_PREFIX}${prefix}*`;
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      
      // Also clear from local cache
      keys.forEach(key => {
        localCache.del(key);
      });
    }
  } catch (error) {
    console.error('Error deleting cache by prefix from Redis:', error);
  }
}

/**
 * Cache calendar events for a specific date range
 * @param {string} userId - The user ID
 * @param {string} startDate - Start date in ISO format
 * @param {string} endDate - End date in ISO format
 * @param {Array} events - Calendar events to cache
 * @param {number} expiry - Expiry time in seconds (optional)
 */
export async function cacheEventsForDateRange(userId, startDate, endDate, events, expiry = 300) {
  try {
    // Create a key for this specific date range
    const rangeKey = `${USER_PREFIX}${userId}:${DATE_RANGE_PREFIX}${startDate}_${endDate}`;
    
    // Store the events
    await redisClient.set(rangeKey, JSON.stringify(events), 'EX', expiry);
    
    // Add this range to a set of all ranges for this user
    await redisClient.sadd(`${USER_PREFIX}${userId}:${DATE_RANGE_PREFIX}all_ranges`, rangeKey);
    
    // Store in local cache too
    localCache.set(rangeKey, events, 10); // 10 seconds
  } catch (error) {
    console.error('Error caching events for date range:', error);
  }
}

/**
 * Get cached events for a specific date range
 * @param {string} userId - The user ID
 * @param {string} startDate - Start date in ISO format
 * @param {string} endDate - End date in ISO format
 * @returns {Array|null} - Cached events or null if not found
 */
export async function getCachedEventsForDateRange(userId, startDate, endDate) {
  try {
    const rangeKey = `${USER_PREFIX}${userId}:${DATE_RANGE_PREFIX}${startDate}_${endDate}`;
    
    // Try local cache first
    const localData = localCache.get(rangeKey);
    if (localData) {
      return localData;
    }
    
    // Try Redis
    const data = await redisClient.get(rangeKey);
    if (data) {
      const parsedData = JSON.parse(data);
      // Store in local cache
      localCache.set(rangeKey, parsedData, 10); // 10 seconds
      return parsedData;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting cached events for date range:', error);
    return null;
  }
}

/**
 * Invalidate cached events for a specific date range
 * @param {string} userId - The user ID
 * @param {string} startDate - Start date in ISO format
 * @param {string} endDate - End date in ISO format
 */
export async function invalidateDateRangeCache(userId, startDate, endDate) {
  try {
    // Get all cached ranges for this user
    const allRanges = await redisClient.smembers(`${USER_PREFIX}${userId}:${DATE_RANGE_PREFIX}all_ranges`);
    
    // Find ranges that overlap with the specified range
    const rangesToInvalidate = [];
    
    for (const rangeKey of allRanges) {
      // Extract dates from the key
      const match = rangeKey.match(new RegExp(`${USER_PREFIX}${userId}:${DATE_RANGE_PREFIX}(.+)_(.+)$`));
      if (match) {
        const [, cachedStart, cachedEnd] = match;
        
        // Check if ranges overlap
        if ((startDate <= cachedEnd) && (endDate >= cachedStart)) {
          rangesToInvalidate.push(rangeKey);
        }
      }
    }
    
    // Delete the overlapping ranges
    if (rangesToInvalidate.length > 0) {
      await redisClient.del(...rangesToInvalidate);
      
      // Remove from the set of all ranges
      await redisClient.srem(`${USER_PREFIX}${userId}:${DATE_RANGE_PREFIX}all_ranges`, ...rangesToInvalidate);
      
      // Clear from local cache too
      rangesToInvalidate.forEach(key => {
        localCache.del(key);
      });
      
      console.log(`Invalidated ${rangesToInvalidate.length} overlapping date ranges for user ${userId}`);
    }
  } catch (error) {
    console.error('Error invalidating date range cache:', error);
  }
}

/**
 * Flush all cache entries
 */
export async function flushCache() {
  try {
    const pattern = `${CACHE_PREFIX}*`;
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
    
    // Also clear date range caches
    const dateRangePattern = `*:${DATE_RANGE_PREFIX}*`;
    const dateRangeKeys = await redisClient.keys(dateRangePattern);
    if (dateRangeKeys.length > 0) {
      await redisClient.del(...dateRangeKeys);
    }
    
    // Clear local cache
    localCache.flushAll();
    
    console.log('Cache flushed successfully');
  } catch (error) {
    console.error('Error flushing cache from Redis:', error);
  }
}

export default redisClient;