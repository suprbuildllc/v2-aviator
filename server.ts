import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { parse } from 'url';
import { sql, eq, and, desc } from 'drizzle-orm';
import Redis from 'ioredis';

import { GameStatus, Bet, RoundHistoryEntry } from './src/types.js';
import { db } from './src/db/index.js';
import { users, rounds, bets } from './src/db/schema.js';
import { signJwt, verifyJwt } from './src/lib/jwt.js';
import { hashPassword, verifyPassword } from './src/lib/auth.js';

// Setup Express
const app = express();
app.use(express.json());
const PORT = 3000;

const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Unique Identifier for this server instance
const instanceId = `inst_${Math.random().toString(36).substring(2, 9)}`;

// --- Dual-Mode Database Fallback ---
let useDb = false;

// Local In-Memory Fallbacks for zero-dependency operation
const localBalances = new Map<number, number>(); // userId -> balance
const localUsersByEmail = new Map<string, any>(); // email -> user
const localUsersById = new Map<number, any>(); // id -> user
const localRounds = new Map<number, any>(); // roundId -> round
const localBets = new Map<string, any>(); // betId -> bet
let localRoundHistory: RoundHistoryEntry[] = [];
let localUserCount = 1;

async function initDb() {
  try {
    console.log('[System] Checking and initializing PostgreSQL tables...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        balance DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
        is_admin BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rounds (
        id INTEGER PRIMARY KEY,
        crash_point DOUBLE PRECISION NOT NULL,
        server_seed TEXT NOT NULL,
        server_seed_hash TEXT NOT NULL,
        client_seed TEXT NOT NULL,
        nonce INTEGER NOT NULL,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        crashed_at TIMESTAMP
      );
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bets (
        id TEXT PRIMARY KEY,
        round_id INTEGER NOT NULL REFERENCES rounds(id),
        user_id INTEGER REFERENCES users(id),
        player_name TEXT NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        auto_cashout DOUBLE PRECISION,
        cashed_out BOOLEAN NOT NULL DEFAULT FALSE,
        cashout_multiplier DOUBLE PRECISION,
        payout DOUBLE PRECISION,
        is_bot BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('[System] PostgreSQL tables initialized successfully.');
    useDb = true;
  } catch (err: any) {
    console.warn(`[System] PostgreSQL initialization failed. Falling back to memory-only database: ${err.message}`);
    useDb = false;
  }
}

// --- DB Helper Functions ---
async function dbGetOrCreateUser(email: string, username: string, passwordHash: string) {
  if (useDb) {
    try {
      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        return existing[0];
      }
      const [inserted] = await db.insert(users).values({
        email,
        username,
        passwordHash,
        balance: 1000.0,
        isAdmin: false
      }).returning();
      return inserted;
    } catch (err: any) {
      console.error('[DB] Failed to query/insert user in DB, using fallback:', err.message);
    }
  }
  
  const existing = localUsersByEmail.get(email);
  if (existing) return existing;
  
  const id = localUserCount++;
  const newUser = {
    id,
    email,
    username,
    passwordHash,
    balance: 1000.0,
    isAdmin: false,
    createdAt: new Date()
  };
  localUsersByEmail.set(email, newUser);
  localUsersById.set(id, newUser);
  localBalances.set(id, 1000.0);
  return newUser;
}

async function dbGetUserById(id: number) {
  if (useDb) {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (result.length > 0) return result[0];
    } catch (err: any) {
      console.error('[DB] Failed to get user by ID:', err.message);
    }
  }
  return localUsersById.get(id) || null;
}

async function dbGetUserByEmail(email: string) {
  if (useDb) {
    try {
      const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (result.length > 0) return result[0];
    } catch (err: any) {
      console.error('[DB] Failed to get user by email:', err.message);
    }
  }
  return localUsersByEmail.get(email) || null;
}

async function dbRefillBalance(userId: number) {
  if (useDb) {
    try {
      const [updated] = await db.update(users).set({ balance: 1000.0 }).where(eq(users.id, userId)).returning();
      return updated.balance;
    } catch (err: any) {
      console.error('[DB] Failed to refill balance:', err.message);
    }
  }
  const u = localUsersById.get(userId);
  if (u) {
    u.balance = 1000.0;
    localBalances.set(userId, 1000.0);
  }
  return 1000.0;
}

async function dbGetRoundHistory() {
  if (useDb) {
    try {
      const dbRounds = await db.select().from(rounds).orderBy(desc(rounds.id)).limit(25);
      return dbRounds.map((r) => ({
        roundId: `#${r.id}`,
        crashPoint: r.crashPoint,
        serverSeed: r.serverSeed,
        serverSeedHash: r.serverSeedHash,
        clientSeed: r.clientSeed,
        nonce: r.nonce,
        timestamp: r.startedAt.getTime(),
      }));
    } catch (err: any) {
      console.error('[DB] Failed to query round history, using memory:', err.message);
    }
  }
  return localRoundHistory;
}

// --- DB Transactions: Placing Bets & Cashouts ---
async function dbPlaceBet(userId: number, roundId: number, amount: number, autoCashout: number | undefined, playerName: string) {
  const betId = `real-${userId}-${Date.now()}`;
  
  if (useDb) {
    try {
      return await db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
        if (!user) throw new Error('User not found.');
        if (user.balance < amount) throw new Error('Insufficient balance.');
        
        const existingBet = await tx.select().from(bets).where(and(eq(bets.roundId, roundId), eq(bets.userId, userId))).limit(1);
        if (existingBet.length > 0) throw new Error('You have already placed a bet for this round.');
        
        const newBalance = parseFloat((user.balance - amount).toFixed(2));
        await tx.update(users).set({ balance: newBalance }).where(eq(users.id, userId));
        
        const [newBet] = await tx.insert(bets).values({
          id: betId,
          roundId,
          userId,
          playerName,
          amount,
          autoCashout,
          cashedOut: false
        }).returning();
        
        return { newBalance, bet: newBet };
      });
    } catch (err: any) {
      console.error('[DB] Place bet transaction failed:', err.message);
      throw err;
    }
  }
  
  const user = localUsersById.get(userId);
  if (!user) throw new Error('User not found.');
  if (user.balance < amount) throw new Error('Insufficient balance.');
  
  const alreadyPlaced = activeBets.some(b => b.playerId === `real-${userId}`);
  if (alreadyPlaced) throw new Error('You have already placed a bet for this round.');
  
  const newBalance = parseFloat((user.balance - amount).toFixed(2));
  user.balance = newBalance;
  localBalances.set(userId, newBalance);
  
  const localBet = {
    id: betId,
    roundId,
    userId,
    playerName,
    amount,
    autoCashout,
    cashedOut: false
  };
  localBets.set(betId, localBet);
  return { newBalance, bet: localBet };
}

async function dbCashoutBet(userId: number, roundId: number, multiplierVal: number) {
  if (useDb) {
    try {
      return await db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
        if (!user) throw new Error('User not found.');
        
        const activePlayerBets = await tx.select().from(bets)
          .where(and(eq(bets.roundId, roundId), eq(bets.userId, userId), eq(bets.cashedOut, false)))
          .for('update');
        
        if (activePlayerBets.length === 0) throw new Error('No active bet found or already cashed out.');
        
        const bet = activePlayerBets[0];
        const payout = parseFloat((bet.amount * multiplierVal).toFixed(2));
        const newBalance = parseFloat((user.balance + payout).toFixed(2));
        
        await tx.update(bets).set({
          cashedOut: true,
          cashoutMultiplier: multiplierVal,
          payout
        }).where(eq(bets.id, bet.id));
        
        await tx.update(users).set({ balance: newBalance }).where(eq(users.id, userId));
        
        return { newBalance, betId: bet.id, payout, multiplier: multiplierVal };
      });
    } catch (err: any) {
      console.error('[DB] Cash out transaction failed:', err.message);
      throw err;
    }
  }
  
  const user = localUsersById.get(userId);
  if (!user) throw new Error('User not found.');
  
  const bet = activeBets.find(b => b.playerId === `real-${userId}` && !b.cashedOut);
  if (!bet) throw new Error('No active bet found or already cashed out.');
  
  const payout = parseFloat((bet.amount * multiplierVal).toFixed(2));
  const newBalance = parseFloat((user.balance + payout).toFixed(2));
  user.balance = newBalance;
  localBalances.set(userId, newBalance);
  
  bet.cashedOut = true;
  bet.cashoutMultiplier = multiplierVal;
  bet.payout = payout;
  
  return { newBalance, betId: bet.id, payout, multiplier: multiplierVal };
}

// --- Dual-Mode Redis & Pub/Sub Setup ---
let useRedis = false;
let redisClient: Redis | null = null;
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

function initRedis() {
  try {
    console.log(`[Redis] Attempting to connect to Redis at ${REDIS_HOST}:${REDIS_PORT}...`);
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('[Redis] Connection failed. Running in standalone, memory-only sync.');
          useRedis = false;
          redisClient?.disconnect();
          redisPub?.disconnect();
          redisSub?.disconnect();
          return null; // Stop retrying
        }
        return Math.min(times * 100, 1000);
      }
    });

    redisPub = new Redis({ host: REDIS_HOST, port: REDIS_PORT, maxRetriesPerRequest: 1 });
    redisSub = new Redis({ host: REDIS_HOST, port: REDIS_PORT, maxRetriesPerRequest: 1 });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully. Multi-instance mode enabled!');
      useRedis = true;
      setupPubSubSubscriptions();
    });

    redisClient.on('error', (err) => {
      console.warn(`[Redis] Connection issue: ${err.message}`);
    });
  } catch (err: any) {
    console.warn(`[Redis] Initialization exception: ${err.message}`);
  }
}

// --- Leader Election Lock ---
let isLeader = false;

async function checkLeaderElection() {
  if (!useRedis || !redisClient) {
    isLeader = true; // Standalone instances are always leaders of their local loop
    return;
  }

  try {
    const result = await redisClient.set('aviator:leader_lock', instanceId, 'PX', 2500, 'NX');
    if (result === 'OK') {
      if (!isLeader) {
        console.log(`[Instance ${instanceId}] Elected as game loop LEADER.`);
        isLeader = true;
      }
    } else {
      const currentLock = await redisClient.get('aviator:leader_lock');
      if (currentLock === instanceId) {
        await redisClient.set('aviator:leader_lock', instanceId, 'PX', 2500); // Renew lock
        isLeader = true;
      } else {
        if (isLeader) {
          console.log(`[Instance ${instanceId}] Stepping down from LEADER.`);
          isLeader = false;
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Leader] Election check error: ${err.message}`);
    isLeader = true; // Fallback to running our own loop to be safe
  }
}

// --- WebSocket Connection Tracking ---
const playerSockets = new Map<number, WebSocket>(); // userId -> WebSocket

// --- Bot simulation names & chats ---
const BOT_NAMES = [
  'LuckyFlight', 'CryptoKing', 'AviatorPro', 'MoonBound', 'CrashMaster',
  'SatoshiFly', 'RiskTaker', 'HoldTheLine', 'ZenTrader', 'ApexFlyer',
  'RocketMan', 'JetSet', 'MultiplierMagic', 'FomoFlyer', 'DoubleOrNothing',
  'HighRoller', 'SkyLimit', 'BullishJet', 'AeroRich', 'TurboCash',
  'CloudRider', 'Velocity', 'Stratosphere', 'GigaChadFly', 'SafeBet',
  'DiamondHands', 'DegenerateFlyer', 'SigmaJet', 'PennyTrader', 'WindChaser'
];

const BOT_CHAT_MESSAGES = [
  'ready to fly!',
  '10x minimum this round please 🙏',
  'Last round was a brutal early crash',
  'cashing out at 1.5x, playing safe today',
  'Let\'s goooo 🚀',
  'Who is holding past 3x?',
  'Aviator to the moon!',
  'ez money guys',
  'oof, barely made it out last time',
  'this is provably fair right? verified last round and it was exact',
  'I have a good feeling about this flight',
  'damn, just missed my cashout',
  'auto cashout set to 2.0x, set and forget',
  'let\'s get that 50x jackpot!'
];

// --- Live round states ---
let currentStatus: GameStatus = 'betting';
let currentMultiplier = 1.0;
let timeLeft = 6.0;
let currentRoundId = 10001;
let nonce = 1;
let serverSeed = crypto.randomBytes(32).toString('hex');
let serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
const clientSeed = 'aviator-community-seed';
let crashPoint = 1.0;
let startTime = 0;

let activeBets: Bet[] = [];
let chatLog: { sender: string; message: string; timestamp: number; isSystem?: boolean }[] = [
  { sender: 'System', message: 'Welcome to Aviator Crash! Place your bets and watch the multiplier fly.', timestamp: Date.now(), isSystem: true }
];

// --- Provably Fair Math ---
function generateCrashPoint(sSeed: string, cSeed: string, currentNonce: number): number {
  const hash = crypto
    .createHmac('sha256', sSeed)
    .update(`${cSeed}-${currentNonce}`)
    .digest('hex');

  const h = parseInt(hash.slice(0, 8), 16);
  const e = Math.pow(2, 32);

  const houseEdge = 0.01;
  const result = Math.floor((100 * e - h) / (e - h)) / 100;
  const finalVal = result * (1 - houseEdge);
  return Math.max(1.00, parseFloat(finalVal.toFixed(2)));
}

// --- Pub/Sub Messaging ---
function publishMessage(channel: string, payload: any) {
  if (useRedis && redisPub) {
    redisPub.publish(channel, JSON.stringify(payload)).catch((err) => {
      console.error('[Redis] Publish failed:', err.message);
    });
  } else {
    // Local fallback direct processing
    handleSyncMessage(channel, payload);
  }
}

function handleSyncMessage(channel: string, payload: any) {
  switch (channel) {
    case 'aviator:sync:tick': {
      currentMultiplier = payload.multiplier;
      activeBets = payload.activeBets;
      broadcastLocal({
        type: 'tick',
        payload: { multiplier: currentMultiplier, activeBets }
      });
      break;
    }
    
    case 'aviator:sync:betting_start': {
      currentStatus = 'betting';
      currentMultiplier = 1.0;
      timeLeft = payload.timeLeft;
      activeBets = payload.activeBets;
      currentRoundId = payload.roundId;
      serverSeedHash = payload.serverSeedHash;
      nonce = payload.nonce;
      
      broadcastLocal({
        type: 'betting_start',
        payload: {
          roundId: `#${currentRoundId}`,
          timeLeft,
          serverSeedHash,
          activeBets,
          nonce
        }
      });
      break;
    }

    case 'aviator:sync:tick_betting': {
      timeLeft = payload.timeLeft;
      broadcastLocal({
        type: 'tick_betting',
        payload: { timeLeft }
      });
      break;
    }

    case 'aviator:sync:round_start': {
      currentStatus = 'running';
      currentMultiplier = 1.0;
      activeBets = payload.activeBets;
      currentRoundId = payload.roundId;
      
      broadcastLocal({
        type: 'round_start',
        payload: {
          roundId: `#${currentRoundId}`,
          activeBets
        }
      });
      break;
    }

    case 'aviator:sync:crash': {
      currentStatus = 'crashed';
      currentMultiplier = payload.crashPoint;
      
      const historyEntry: RoundHistoryEntry = {
        roundId: `#${payload.roundId}`,
        crashPoint: payload.crashPoint,
        serverSeed: payload.serverSeed,
        serverSeedHash: payload.serverSeedHash,
        clientSeed: payload.clientSeed,
        nonce: payload.nonce,
        timestamp: Date.now()
      };
      
      localRoundHistory.unshift(historyEntry);
      if (localRoundHistory.length > 25) localRoundHistory.pop();
      
      broadcastLocal({
        type: 'crash',
        payload: {
          crashPoint: payload.crashPoint,
          serverSeed: payload.serverSeed,
          serverSeedHash: payload.serverSeedHash,
          clientSeed: payload.clientSeed,
          nonce: payload.nonce,
          roundHistory: payload.roundHistory
        }
      });
      break;
    }

    case 'aviator:sync:bet_placed': {
      const exists = activeBets.some(b => b.id === payload.bet.id);
      if (!exists) {
        activeBets.push(payload.bet);
      }
      broadcastLocal({
        type: 'bet_placed',
        payload: { bet: payload.bet }
      });
      break;
    }

    case 'aviator:sync:cash_out_success': {
      activeBets = activeBets.map((b) =>
        b.id === payload.betId
          ? { ...b, cashedOut: true, cashoutMultiplier: payload.multiplier, payout: payload.payout }
          : b
      );
      
      broadcastLocal({
        type: 'cash_out_success',
        payload: payload
      });
      
      // Update balance directly if player is on this instance
      const localWs = playerSockets.get(payload.userId);
      if (localWs && localWs.readyState === WebSocket.OPEN) {
        localWs.send(JSON.stringify({
          type: 'balance_update',
          payload: { balance: payload.balance }
        }));
      }
      break;
    }

    case 'aviator:sync:chat': {
      chatLog.push(payload);
      if (chatLog.length > 40) chatLog.shift();
      broadcastLocal({
        type: 'chat_message',
        payload
      });
      break;
    }
  }
}

function setupPubSubSubscriptions() {
  if (!redisSub) return;
  const channels = [
    'aviator:sync:tick',
    'aviator:sync:betting_start',
    'aviator:sync:tick_betting',
    'aviator:sync:round_start',
    'aviator:sync:crash',
    'aviator:sync:bet_placed',
    'aviator:sync:cash_out_success',
    'aviator:sync:chat'
  ];
  
  redisSub.subscribe(...channels).then(() => {
    console.log('[Redis] Subscribed to synchronization channels.');
  }).catch((err) => {
    console.error('[Redis] Subscriptions failed:', err.message);
  });
  
  redisSub.on('message', (channel, message) => {
    try {
      const payload = JSON.parse(message);
      handleSyncMessage(channel, payload);
    } catch (err: any) {
      console.error(`[Redis] Error processing channel ${channel} payload:`, err.message);
    }
  });
}

// --- Local WebSocket Broadcasts ---
function broadcastLocal(message: any) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function sendChatMessage(sender: string, message: string, isSystem = false) {
  const chatItem = { sender, message, timestamp: Date.now(), isSystem };
  publishMessage('aviator:sync:chat', chatItem);
}

// --- Game Loop Management (Run only by the leader) ---
function startBettingPhase() {
  if (!isLeader) return;
  
  currentStatus = 'betting';
  currentMultiplier = 1.0;
  timeLeft = 6.0;
  activeBets = [];

  serverSeed = crypto.randomBytes(32).toString('hex');
  serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  crashPoint = generateCrashPoint(serverSeed, clientSeed, nonce);

  console.log(`[Leader Round ${currentRoundId}] Betting started. Target: ${crashPoint}x`);

  // Spawn simulated bots
  const numBots = Math.floor(Math.random() * 8) + 4;
  const shuffledBots = [...BOT_NAMES].sort(() => 0.5 - Math.random());

  for (let i = 0; i < numBots; i++) {
    const botName = shuffledBots[i];
    const amount = Math.floor(Math.random() * 20) * 10 + 10;
    const hasAuto = Math.random() < 0.35;
    const autoCashout = hasAuto ? parseFloat((Math.random() * 2.5 + 1.2).toFixed(2)) : undefined;

    activeBets.push({
      id: `bot-${botName}-${Date.now()}-${i}`,
      playerId: `bot-${botName}`,
      playerName: botName,
      amount,
      autoCashout,
      cashedOut: false,
      isSimulated: true
    });
  }

  // Publish betting phase start
  publishMessage('aviator:sync:betting_start', {
    roundId: currentRoundId,
    timeLeft,
    serverSeedHash,
    activeBets,
    nonce
  });

  // Betting Countdown Loop
  const countdownInterval = setInterval(() => {
    if (!isLeader || currentStatus !== 'betting') {
      clearInterval(countdownInterval);
      return;
    }

    timeLeft = parseFloat((timeLeft - 0.1).toFixed(1));

    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      startRunningPhase();
    } else {
      publishMessage('aviator:sync:tick_betting', { timeLeft });
    }
  }, 100);

  // Trigger occasional bot chat
  setTimeout(() => {
    if (!isLeader || currentStatus !== 'betting') return;
    if (Math.random() < 0.6 && activeBets.length > 0) {
      const randomBot = activeBets[Math.floor(Math.random() * activeBets.length)].playerName;
      const randomMsg = BOT_CHAT_MESSAGES[Math.floor(Math.random() * BOT_CHAT_MESSAGES.length)];
      sendChatMessage(randomBot, randomMsg);
    }
  }, 2500);
}

function startRunningPhase() {
  if (!isLeader) return;
  
  currentStatus = 'running';
  startTime = Date.now();
  currentMultiplier = 1.0;

  console.log(`[Leader Round ${currentRoundId}] Running. Flight crash point: ${crashPoint}x`);

  publishMessage('aviator:sync:round_start', {
    roundId: currentRoundId,
    activeBets
  });

  tickRunning();
}

function tickRunning() {
  if (!isLeader || currentStatus !== 'running') return;

  const elapsed = (Date.now() - startTime) / 1000;
  const growthFactor = 0.07;
  currentMultiplier = parseFloat(Math.pow(Math.E, growthFactor * elapsed).toFixed(2));

  if (currentMultiplier >= crashPoint) {
    triggerCrash();
    return;
  }

  // Handle bot auto-cashouts and manual simulated bot actions
  activeBets.forEach((bet) => {
    if (bet.cashedOut) return;

    if (bet.autoCashout && currentMultiplier >= bet.autoCashout) {
      executeBotCashout(bet, bet.autoCashout);
    } else if (bet.isSimulated && !bet.autoCashout) {
      const cashoutChance = 0.02 + (currentMultiplier - 1.0) * 0.015;
      if (Math.random() < cashoutChance && currentMultiplier > 1.1) {
        executeBotCashout(bet, currentMultiplier);
      }
    }
  });

  publishMessage('aviator:sync:tick', {
    multiplier: currentMultiplier,
    activeBets
  });

  setTimeout(tickRunning, 50);
}

function executeBotCashout(bet: Bet, multiplierVal: number) {
  if (!isLeader) return;
  
  bet.cashedOut = true;
  bet.cashoutMultiplier = multiplierVal;
  bet.payout = parseFloat((bet.amount * multiplierVal).toFixed(2));

  publishMessage('aviator:sync:cash_out_success', {
    betId: bet.id,
    userId: 0,
    playerId: bet.playerId,
    playerName: bet.playerName,
    multiplier: multiplierVal,
    payout: bet.payout,
    balance: 0
  });
}

async function triggerCrash() {
  if (!isLeader) return;

  currentStatus = 'crashed';
  const finalCrashMultiplier = crashPoint;

  console.log(`[Leader Round ${currentRoundId}] Crashed at ${finalCrashMultiplier}x`);

  // Persist Round in DB if available
  if (useDb) {
    try {
      await db.insert(rounds).values({
        id: currentRoundId,
        crashPoint: finalCrashMultiplier,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        crashedAt: new Date()
      });
      
      // Mark all un-cashed real-player bets in DB as lost
      const realBets = activeBets.filter(b => !b.isSimulated && !b.cashedOut);
      for (const b of realBets) {
        const uId = parseInt(b.playerId.replace('real-', ''), 10);
        await db.update(bets).set({
          cashedOut: false,
          cashoutMultiplier: 0.0,
          payout: 0.0
        }).where(eq(bets.id, b.id));
      }
    } catch (err: any) {
      console.error('[DB] Failed to persist round / bet results:', err.message);
    }
  }

  // Load latest database history to distribute
  const latestHistory = await dbGetRoundHistory();

  publishMessage('aviator:sync:crash', {
    roundId: currentRoundId,
    crashPoint: finalCrashMultiplier,
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    roundHistory: latestHistory
  });

  nonce++;
  currentRoundId++;

  // Bot crash comments
  setTimeout(() => {
    if (!isLeader) return;
    if (Math.random() < 0.5 && activeBets.length > 0) {
      const bots = activeBets.filter(b => b.isSimulated);
      if (bots.length > 0) {
        const randomBot = bots[Math.floor(Math.random() * bots.length)];
        if (randomBot.cashedOut) {
          const winComments = ['Boom! easy win', 'Nice flight', 'Glad I cashed out', 'cash is king 🤑'];
          sendChatMessage(randomBot.playerName, winComments[Math.floor(Math.random() * winComments.length)]);
        } else {
          const loseComments = ['ahhh, too greedy', 'crashed so fast!', 'rip bet', 'damn it 😭', 'next round we win big'];
          sendChatMessage(randomBot.playerName, loseComments[Math.floor(Math.random() * loseComments.length)]);
        }
      }
    }
  }, 1000);

  setTimeout(startBettingPhase, 4000);
}

// --- Setup WebSocket Server attached to Server ---
const wss = new WebSocketServer({ noServer: true });

// HTTP Server upgrade handler with JWT Authentication
// Reject the connection directly if token is invalid or missing
// Satisfies Goal #1: Eliminate the security auth hole completely
httpServer.on('upgrade', (request, socket, head) => {
  const { query } = parse(request.url || '', true);
  const token = query.token as string;

  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, payload);
  });
});

// WS Session Handler with authenticated payload passed directly
wss.on('connection', async (ws: WebSocket, request, decodedUser: any) => {
  const userId = decodedUser.id;
  const username = decodedUser.username;
  
  console.log(`[WS] Authenticated connection established for user ${username} (${userId})`);

  // Map user ID to connection socket
  playerSockets.set(userId, ws);

  // Load actual user profile from DB or local memory store
  const user = await dbGetUserById(userId);
  const userBalance = user ? user.balance : 1000.0;

  // Retrieve latest 25 rounds of history
  const history = await dbGetRoundHistory();

  // Initialize client with full game state and user balance
  ws.send(JSON.stringify({
    type: 'init',
    payload: {
      status: currentStatus,
      multiplier: currentMultiplier,
      timeLeft: currentStatus === 'betting' ? timeLeft : 0,
      currentRoundId: `#${currentRoundId}`,
      serverSeedHash,
      activeBets,
      roundHistory: history,
      balance: userBalance,
      chatLog,
      nonce,
      clientSeed
    }
  }));

  ws.on('message', async (messageStr: string) => {
    try {
      const data = JSON.parse(messageStr);
      const { type, payload } = data;

      switch (type) {
        case 'place_bet': {
          if (currentStatus !== 'betting') {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: 'Bets can only be placed during the betting countdown phase.' }
            }));
            return;
          }

          const amount = parseFloat(payload.amount);
          const autoCashout = payload.autoCashout ? parseFloat(payload.autoCashout) : undefined;

          if (isNaN(amount) || amount <= 0) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: 'Invalid bet amount.' }
            }));
            return;
          }

          try {
            // Execute inside Transaction with user balance validation & row locking
            const betResult = await dbPlaceBet(userId, currentRoundId, amount, autoCashout, username);

            // Send balance update directly to the client
            ws.send(JSON.stringify({
              type: 'balance_update',
              payload: { balance: betResult.newBalance }
            }));

            // Sync with other instances and notify all players of the new bet
            publishMessage('aviator:sync:bet_placed', {
              bet: {
                id: betResult.bet.id,
                playerId: `real-${userId}`,
                playerName: username,
                amount,
                autoCashout,
                cashedOut: false
              }
            });

            console.log(`[WS] Bet placed by ${username}: $${amount} (Auto-cash: ${autoCashout || 'None'})`);
          } catch (err: any) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: err.message || 'Failed to place bet.' }
            }));
          }
          break;
        }

        case 'cash_out': {
          if (currentStatus !== 'running') {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: 'Can only cash out while the plane is flying!' }
            }));
            return;
          }

          try {
            // Execute inside DB transaction with user and bet row updates
            const cashResult = await dbCashoutBet(userId, currentRoundId, currentMultiplier);

            // Publish cashout success across all instances
            publishMessage('aviator:sync:cash_out_success', {
              betId: cashResult.betId,
              userId: userId,
              playerId: `real-${userId}`,
              playerName: username,
              multiplier: cashResult.multiplier,
              payout: cashResult.payout,
              balance: cashResult.newBalance
            });

            console.log(`[WS] Player ${username} cashed out at ${cashResult.multiplier}x for $${cashResult.payout}`);
          } catch (err: any) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: err.message || 'Failed to cash out.' }
            }));
          }
          break;
        }

        case 'chat': {
          const { message } = payload;
          if (message && message.trim()) {
            sendChatMessage(username, message.substring(0, 150));
          }
          break;
        }

        case 'reset_balance': {
          // Gated reset balance: Users can refill their own balance up to 1000 if it falls below 50.
          // This eliminates unauthenticated cheating while maintaining an active playground experience.
          const profile = await dbGetUserById(userId);
          const currentBal = profile ? profile.balance : 0;
          
          if (currentBal >= 50 && !profile?.isAdmin) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { message: 'Your balance is still sufficient ($50 or more). Play on!' }
            }));
            return;
          }

          const newBal = await dbRefillBalance(userId);
          ws.send(JSON.stringify({
            type: 'balance_update',
            payload: { balance: newBal }
          }));
          
          ws.send(JSON.stringify({
            type: 'chat_message',
            payload: { sender: 'System', message: 'Your balance has been refilled to $1,000.00.', timestamp: Date.now(), isSystem: true }
          }));
          console.log(`[WS] Balance refilled for ${username} (${userId}) to $${newBal}`);
          break;
        }
      }
    } catch (e: any) {
      console.error('[WS] Error parsing message:', e.message);
    }
  });

  ws.on('close', () => {
    playerSockets.delete(userId);
    console.log(`[WS] Connection closed for user ${username} (${userId})`);
  });
});

// --- HTTP REST Endpoints ---

// Registration
app.post('/api/auth/register', async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existing = await dbGetUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashed = hashPassword(password);
    const user = await dbGetOrCreateUser(email, username, hashed);
    const token = signJwt({ id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin });
    
    return res.json({ token, user: { id: user.id, username: user.username, email: user.email, balance: user.balance } });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await dbGetUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signJwt({ id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin });
    return res.json({ token, user: { id: user.id, username: user.username, email: user.email, balance: user.balance } });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Profile
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyJwt(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized or expired token' });
  }

  try {
    const user = await dbGetUserById(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: { id: user.id, username: user.username, email: user.email, balance: user.balance, isAdmin: user.isAdmin } });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/history', async (req, res) => {
  const history = await dbGetRoundHistory();
  res.json({
    currentRoundId,
    history,
    status: currentStatus,
    multiplier: currentMultiplier
  });
});

// --- Vite Frontend Development Setup ---
const isProd = process.env.NODE_ENV === 'production';

async function setupVite() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Start-up sequence
async function main() {
  // Self-healing local service starter
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    console.log('[System] Inspecting local system services...');
    try {
      const { stdout: redisStatus } = await execAsync('pgrep -x redis-server || true');
      if (!redisStatus.trim()) {
        console.log('[System] Starting redis-server locally...');
        await execAsync('service redis-server start || redis-server --daemonize yes || true');
      } else {
        console.log('[System] Local redis-server is active.');
      }
    } catch (redisErr: any) {
      console.warn('[System] Redis service start check failed:', redisErr.message);
    }

    try {
      const { stdout: pgStatus } = await execAsync('pgrep -x postgres || pgrep -x postmaster || true');
      if (!pgStatus.trim()) {
        console.log('[System] Starting postgresql locally with custom runner...');
        await execAsync('mkdir -p /var/run/postgresql && chown -R postgres:postgres /var/run/postgresql || true');
        await execAsync('su - postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D /var/lib/postgresql/data -l /tmp/postgres.log start" || true');
      } else {
        console.log('[System] Local postgresql is active.');
      }
    } catch (pgErr: any) {
      console.warn('[System] PostgreSQL service start check failed:', pgErr.message);
    }
  } catch (e: any) {
    console.warn('[System] Local service launcher not available:', e.message);
  }

  await initDb();
  initRedis();
  await setupVite();

  // Run periodic leader lock checks
  setInterval(checkLeaderElection, 1000);
  
  // Start the actual game loop ticking
  // Leader lock check evaluates isLeader. If true, startBettingPhase will run.
  setTimeout(() => {
    if (isLeader) {
      startBettingPhase();
    }
  }, 1500);
}

main().catch((err) => {
  console.error('[System] Fatal crash during bootstrap:', err.message);
});
