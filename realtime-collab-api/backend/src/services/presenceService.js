const redis = require('../../config/redis');

const PRESENCE_TTL = 30; // seconds

const presenceKey = (docId) => `presence:${docId}`;
const cursorKey = (docId, userId) => `cursor:${docId}:${userId}`;

const userJoined = async (docId, user) => {
  const key = presenceKey(docId);
  await redis.hset(key, user.id, JSON.stringify({
    id: user.id,
    username: user.username,
    joinedAt: Date.now(),
  }));
  await redis.expire(key, 300);
};

const userLeft = async (docId, userId) => {
  await redis.hdel(presenceKey(docId), userId);
  await redis.del(cursorKey(docId, userId));
};

const getActiveUsers = async (docId) => {
  const raw = await redis.hgetall(presenceKey(docId));
  if (!raw) return [];
  return Object.values(raw).map((v) => JSON.parse(v));
};

const updateCursor = async (docId, userId, cursor) => {
  const key = cursorKey(docId, userId);
  await redis.setex(key, PRESENCE_TTL, JSON.stringify(cursor));
};

const getCursors = async (docId, userIds) => {
  const cursors = {};
  for (const uid of userIds) {
    const raw = await redis.get(cursorKey(docId, uid));
    if (raw) cursors[uid] = JSON.parse(raw);
  }
  return cursors;
};

const refreshPresence = async (docId, userId) => {
  await redis.expire(presenceKey(docId), 300);
};

module.exports = {
  userJoined,
  userLeft,
  getActiveUsers,
  updateCursor,
  getCursors,
  refreshPresence,
};
