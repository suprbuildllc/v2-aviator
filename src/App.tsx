import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas.js';
import BetControl from './components/BetControl.js';
import BetBoard from './components/BetBoard.js';
import ProvablyFairUI from './components/ProvablyFairUI.js';
import RecentHistory from './components/RecentHistory.js';
import ChatRoom from './components/ChatRoom.js';
import { GameStatus, Bet, RoundHistoryEntry } from './types.js';
import { Plane, Shield, Volume2, VolumeX, User, Server, Key, Mail, RefreshCw, LogOut } from 'lucide-react';

// --- Pure JS Synchronous SHA-256 for Seed Hash Generation ---
function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i, j;
  const result: any[] = [];
  const words: any[] = [];
  const asciiLength = ascii[lengthProperty];
  
  const hash = (sha256 as any).h = (sha256 as any).h || [];
  const k = (sha256 as any).k = (sha256 as any).k || [];
  let primeCounter = k[lengthProperty];

  const isComposite: any = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = 1;
      }
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  
  let asciiString = ascii + '\x80';
  while (asciiString[lengthProperty] % 64 - 56) asciiString += '\x00';
  
  for (i = 0; i < asciiString[lengthProperty]; i++) {
    j = asciiString.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i % 4) * 8);
  }
  words[words[lengthProperty]] = ((asciiLength * 8) / maxWord) | 0;
  words[words[lengthProperty]] = (asciiLength * 8) | 0;
  
  let h0 = hash[0], h1 = hash[1], h2 = hash[2], h3 = hash[3], h4 = hash[4], h5 = hash[5], h6 = hash[6], h7 = hash[7];
  
  for (i = 0; i < words[lengthProperty]; i += 16) {
    const w = words.slice(i, i + 16);
    let oldh0 = h0, oldh1 = h1, oldh2 = h2, oldh3 = h3, oldh4 = h4, oldh5 = h5, oldh6 = h6, oldh7 = h7;
    
    for (j = 0; j < 64; j++) {
      if (j < 16) {
        // Already filled
      } else {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      
      const ch = (h4 & h5) ^ (~h4 & h6);
      const maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2);
      const s0 = rightRotate(h0, 2) ^ rightRotate(h0, 13) ^ rightRotate(h0, 22);
      const s1 = rightRotate(h4, 6) ^ rightRotate(h4, 11) ^ rightRotate(h4, 25);
      
      const temp1 = (h7 + s1 + ch + k[j] + (w[j] || 0)) | 0;
      const temp2 = (s0 + maj) | 0;
      
      h7 = h6;
      h6 = h5;
      h5 = h4;
      h4 = (h3 + temp1) | 0;
      h3 = h2;
      h2 = h1;
      h1 = h0;
      h0 = (temp1 + temp2) | 0;
    }
    
    h0 = (h0 + oldh0) | 0;
    h1 = (h1 + oldh1) | 0;
    h2 = (h2 + oldh2) | 0;
    h3 = (h3 + oldh3) | 0;
    h4 = (h4 + oldh4) | 0;
    h5 = (h5 + oldh5) | 0;
    h6 = (h6 + oldh6) | 0;
    h7 = (h7 + oldh7) | 0;
  }
  
  const h = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (i = 0; i < 8; i++) {
    let hex = (h[i] >>> 0).toString(16);
    while (hex[lengthProperty] < 8) hex = '0' + hex;
    result.push(hex);
  }
  return result.join('');
}

// Helper to generate a random hex string
const generateRandomHex = (length: number) => {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
};

// Cryptographically authentic crash point generator via Web Crypto API (HMAC-SHA256)
const getCrashPointFromSeeds = async (serverSeed: string, clientSeed: string, nonce: number): Promise<number> => {
  try {
    const enc = new TextEncoder();
    const keyData = enc.encode(serverSeed.trim());
    const msgData = enc.encode(`${clientSeed.trim()}-${nonce}`);

    const key = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', key, msgData);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const h = parseInt(hashHex.slice(0, 8), 16);
    const e = Math.pow(2, 32);

    const houseEdge = 0.01;
    const resultMultiplier = Math.floor((100 * e - h) / (e - h)) / 100;
    const finalVal = resultMultiplier * (1 - houseEdge);
    return Math.max(1.00, parseFloat(finalVal.toFixed(2)));
  } catch (err) {
    console.error('Error calculating crash point client-side:', err);
    return Math.max(1.01, parseFloat((1 + Math.random() * 5).toFixed(2)));
  }
};

// Helper to compute sha256 of a string using Web Crypto API (for server seed hash)
const computeSha256 = async (text: string): Promise<string> => {
  try {
    const msgUint8 = new TextEncoder().encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    // Fallback simple hash
    return sha256(text);
  }
};

// Simulated bots details
const BOT_NAMES = [
  'RocketMan_99', 'CrashMaster', 'LuckyFlyer', 'AviatorPro', 'HighRoller',
  'DiamondHands', 'MoonShot', 'Satoshi_88', 'SkyCaptain', 'Zephyr',
  'Propeller_Head', 'JetSet', 'Airborne_01', 'Altitude_Limit', 'Cloud_Rider',
  'FlewAway_First', 'SonicBoom', 'Vortex_FX', 'Piston_Pilot', 'Radar_Run'
];

// Initial default round history for demo fallback
const defaultHistory: RoundHistoryEntry[] = [
  { roundId: '#10009', crashPoint: 4.21, serverSeed: 'b5fb3abbc19953218c68bd2c6029c36d32a347e7d261c6e6a460ea61c22ce631', serverSeedHash: '9ae4828dbd36083a26cdc15deb0faaf8961dc7976e5210ae7838caf820edc612', clientSeed: 'aviator-community-seed', nonce: 9, timestamp: Date.now() - 300000 },
  { roundId: '#10008', crashPoint: 1.18, serverSeed: 'c5a5545f3616e73d7c7725dfeb9f693246e1b786e0784711cda43c8448c5587c', serverSeedHash: '47f9162ff34492c309d464e44c48ce53d1c6fd574e17067dbafa8ab92a76ace3', clientSeed: 'aviator-community-seed', nonce: 8, timestamp: Date.now() - 260000 },
  { roundId: '#10007', crashPoint: 2.66, serverSeed: '330f95eda7b6dfda000b724e63b9cfd93c94eea6f462883a93bf984a2f0f9ca7', serverSeedHash: '15623d006d03ad30b0748909791735290f8882cc1b8803f776ec5123c7b8edbb', clientSeed: 'aviator-community-seed', nonce: 7, timestamp: Date.now() - 220000 },
  { roundId: '#10006', crashPoint: 6.43, serverSeed: '891fcad85e4a935cf8bdc0df83ebd16e9bb29f551d149bf65a7a27c86f3de29d', serverSeedHash: '232d9a152dc637df7c781ad1c7745aa4e2366427def1171cffbf8457946ebb40', clientSeed: 'aviator-community-seed', nonce: 6, timestamp: Date.now() - 180000 },
  { roundId: '#10005', crashPoint: 1.12, serverSeed: '0fb19d7a6019387107a135c41ce311b6de53815cdae7ec1438066f69008e7157', serverSeedHash: '2f9cc48ad409920f5f58c476aa83d3016847f6b56d2e41920cc5a5aff4d7cf16', clientSeed: 'aviator-community-seed', nonce: 5, timestamp: Date.now() - 140000 },
  { roundId: '#10004', crashPoint: 38.91, serverSeed: '64d1cf5a824645fe3b4e0ca027304a9e49e45c6c7418ecd67cd3907a2a1879ad', serverSeedHash: 'a17c9ae7dfac540112452994d758e216c50eccb931175ad51feced1617b30f14', clientSeed: 'aviator-community-seed', nonce: 4, timestamp: Date.now() - 100000 }
];

// Initial default chat room logs
const defaultChat = [
  { sender: 'System', message: 'Welcome to Aviator Crash! Place your bets and watch the plane climb.', timestamp: Date.now() - 120000, isSystem: true },
  { sender: 'RocketMan_99', message: 'Flew away at 1.5x last round, playing safe today.', timestamp: Date.now() - 90000 },
  { sender: 'LuckyFlyer', message: 'Anyone going for a 10x?', timestamp: Date.now() - 60000 },
  { sender: 'CrashMaster', message: 'Love the new provably fair system here.', timestamp: Date.now() - 30000 }
];

// Simple Web Audio Sound Effects Synthesizer (No assets needed!)
class SoundEffects {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  playStart() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(350, this.ctx.currentTime + 1.2);
    
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 1.2);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 1.2);
  }

  playCashout() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, this.ctx.currentTime);
    osc1.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.1);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1046.50, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(this.ctx.currentTime + 0.35);
    osc2.stop(this.ctx.currentTime + 0.35);
  }

  playCrash() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.8);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.8);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.8);
  }
}

const sfx = new SoundEffects();

export default function App() {
  // Authentication states (Persisted locally)
  const [token, setToken] = useState<string | null>(localStorage.getItem('aviator_token'));
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Connection states (Static green for robust demo mode)
  const [connectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connected');
  const [wsError] = useState<string | null>(null);

  // Synchronized Game Loop variables (Using refs to secure closure safety in intervals)
  const stateRef = useRef({
    status: 'betting' as GameStatus,
    multiplier: 1.0,
    timeLeft: 6.0,
    roundId: '#10010',
    serverSeed: 'b5fb3abbc19953218c68bd2c6029c36d32a347e7d261c6e6a460ea61c22ce631',
    serverSeedHash: '9ae4828dbd36083a26cdc15deb0faaf8961dc7976e5210ae7838caf820edc612',
    nonce: 10,
    activeBets: [] as Bet[],
    queuedBets: [] as { amount: number; autoCashout?: number }[],
    balance: 1000.0,
    history: [] as RoundHistoryEntry[],
    chatLog: [] as { sender: string; message: string; timestamp: number; isSystem?: boolean }[],
    crashPoint: 2.38,
    runningStartTime: 0
  });

  // Reactive visual mirror states synced to the game loop
  const [status, setStatus] = useState<GameStatus>('betting');
  const [multiplier, setMultiplier] = useState(1.0);
  const [timeLeft, setTimeLeft] = useState(6.0);
  const [roundId, setRoundId] = useState('#10010');
  const [serverSeedHash, setServerSeedHash] = useState('9ae4828dbd36083a26cdc15deb0faaf8961dc7976e5210ae7838caf820edc612');
  const [activeBets, setActiveBets] = useState<Bet[]>([]);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>([]);
  const [balance, setBalance] = useState(1000.0);
  const [chatLog, setChatLog] = useState<{ sender: string; message: string; timestamp: number; isSystem?: boolean }[]>([]);
  const [currentNonce, setCurrentNonce] = useState(10);
  const [communityClientSeed] = useState('aviator-community-seed');

  // Sidebar utility active pane
  const [activeTab, setActiveTab] = useState<'lobby' | 'fairness'>('lobby');
  const [isMuted, setIsMuted] = useState(false);

  // 1. Initial Profile/Session Bootloader
  useEffect(() => {
    let activeUser = null;
    const savedUserJson = localStorage.getItem('aviator_current_user');
    
    if (token && savedUserJson) {
      try {
        activeUser = JSON.parse(savedUserJson);
      } catch (e) {
        console.warn('Failed parsing cached user credentials.');
      }
    }

    if (!activeUser) {
      // Automatic quick-load of a robust offline pilot session if none exists
      const fallbackToken = 'demo-bypass-token';
      const fallbackUser = { id: 1, username: 'PilotDemo', email: 'demo@demo.com', balance: 1000.0, isAdmin: false };
      
      localStorage.setItem('aviator_token', fallbackToken);
      localStorage.setItem('aviator_current_user', JSON.stringify(fallbackUser));
      
      setToken(fallbackToken);
      setCurrentUser(fallbackUser);
      activeUser = fallbackUser;
    } else {
      setCurrentUser(activeUser);
    }

    // Load Balance
    const cachedBalance = localStorage.getItem(`aviator_balance_${activeUser.email}`);
    const activeBalance = cachedBalance ? parseFloat(cachedBalance) : activeUser.balance;
    setBalance(activeBalance);
    stateRef.current.balance = activeBalance;

    // Load custom round history
    const cachedHistory = localStorage.getItem('aviator_history_v2');
    if (cachedHistory) {
      try {
        const hist = JSON.parse(cachedHistory);
        setRoundHistory(hist);
        stateRef.current.history = hist;
        if (hist.length > 0) {
          const latest = hist[0];
          const nextRoundNum = parseInt(latest.roundId.replace('#', '')) + 1;
          const nextNonceNum = latest.nonce + 1;
          setRoundId(`#${nextRoundNum}`);
          stateRef.current.roundId = `#${nextRoundNum}`;
          setCurrentNonce(nextNonceNum);
          stateRef.current.nonce = nextNonceNum;
        }
      } catch (err) {}
    } else {
      setRoundHistory(defaultHistory);
      stateRef.current.history = defaultHistory;
      localStorage.setItem('aviator_history_v2', JSON.stringify(defaultHistory));
    }

    // Load chat log
    const cachedChat = localStorage.getItem('aviator_chat_v2');
    if (cachedChat) {
      try {
        const chat = JSON.parse(cachedChat);
        setChatLog(chat);
        stateRef.current.chatLog = chat;
      } catch (err) {}
    } else {
      setChatLog(defaultChat);
      stateRef.current.chatLog = defaultChat;
      localStorage.setItem('aviator_chat_v2', JSON.stringify(defaultChat));
    }
  }, [token]);

  // Synchronized balance state cache writer
  const updateBalance = (newBal: number) => {
    const fixedBal = parseFloat(newBal.toFixed(2));
    stateRef.current.balance = fixedBal;
    setBalance(fixedBal);
    if (currentUser) {
      localStorage.setItem(`aviator_balance_${currentUser.email}`, String(fixedBal));
    }
  };

  // 2. Centralized In-Memory Game Simulation loop
  useEffect(() => {
    if (!currentUser) return;

    let timer: any;
    let chatTimer: any;

    const setupNextRound = async () => {
      const newServerSeed = generateRandomHex(64);
      const newHash = await computeSha256(newServerSeed);
      const nextNonce = stateRef.current.nonce + 1;
      const nextRoundNum = parseInt(stateRef.current.roundId.replace('#', '')) + 1;
      const nextRoundId = `#${nextRoundNum}`;

      const calculatedCrashPoint = await getCrashPointFromSeeds(newServerSeed, communityClientSeed, nextNonce);

      stateRef.current.serverSeed = newServerSeed;
      stateRef.current.serverSeedHash = newHash;
      stateRef.current.nonce = nextNonce;
      stateRef.current.roundId = nextRoundId;
      stateRef.current.crashPoint = calculatedCrashPoint;

      setServerSeedHash(newHash);
      setCurrentNonce(nextNonce);
      setRoundId(nextRoundId);
      
      console.log(`[Simulator] Prepared next round ${nextRoundId}. Crash Point = ${calculatedCrashPoint}x`);
    };

    // Simulated community player comments
    chatTimer = setInterval(() => {
      if (Math.random() > 0.4) {
        const randomBotName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
        const comments = [
          'To the moon! 🚀',
          'Cashed out at 1.5x, safe profit.',
          'Next round is going to be HUGE!',
          'Omg crashed at 1.1x...',
          'Diamond hands, still holding!',
          'Let\'s go pilots! ✈️',
          'Cashed out at 2.5x, yes!',
          'This is crazy climbing!',
          'Is anyone verifying with the seeds?',
          'Provably fair checks out perfectly.',
          'Placing a big bet next round.',
          'Ah, missed the cashout!',
          'Going for 5x this time.'
        ];
        const msg = comments[Math.floor(Math.random() * comments.length)];
        const newChat = { sender: randomBotName, message: msg, timestamp: Date.now() };
        setChatLog((prev) => {
          const logs = [...prev, newChat];
          if (logs.length > 40) logs.shift();
          localStorage.setItem('aviator_chat_v2', JSON.stringify(logs));
          return logs;
        });
      }
    }, 8000);

    const tick = () => {
      const now = Date.now();
      const currentStatus = stateRef.current.status;

      if (currentStatus === 'betting') {
        let newTime = stateRef.current.timeLeft - 0.1;
        if (newTime <= 0) {
          // Transition to active flight
          stateRef.current.status = 'running';
          stateRef.current.multiplier = 1.0;
          stateRef.current.runningStartTime = now;

          const newBets: Bet[] = [];
          
          // 1. Add user's queued bets (if placed)
          stateRef.current.queuedBets.forEach((qb, idx) => {
            newBets.push({
              id: `real-${currentUser.id}-${idx}-${now}`,
              playerId: `real-${currentUser.id}`,
              playerName: currentUser.username,
              amount: qb.amount,
              autoCashout: qb.autoCashout,
              cashedOut: false,
              isSimulated: false,
              timestamp: now
            });
          });
          stateRef.current.queuedBets = []; // Clear queue

          // 2. Add randomized multiplayer bots
          const botCount = 4 + Math.floor(Math.random() * 8);
          const shuffledBots = [...BOT_NAMES].sort(() => 0.5 - Math.random()).slice(0, botCount);
          shuffledBots.forEach((botName) => {
            const amount = [5, 10, 20, 50, 100, 150][Math.floor(Math.random() * 6)];
            const hasAuto = Math.random() < 0.35;
            const autoCashout = hasAuto ? parseFloat((1.15 + Math.random() * 2.5).toFixed(2)) : undefined;
            const targetMultiplier = parseFloat((1.1 + Math.random() * 3.5).toFixed(2));

            newBets.push({
              id: `bot-${botName}-${now}`,
              playerId: `bot-${botName}`,
              playerName: botName,
              amount,
              autoCashout,
              targetMultiplier,
              cashedOut: false,
              timestamp: now,
              isSimulated: true
            } as any);
          });

          stateRef.current.activeBets = newBets;
          setActiveBets(newBets);
          
          setStatus('running');
          setMultiplier(1.0);
          sfx.playStart();
        } else {
          stateRef.current.timeLeft = newTime;
          setTimeLeft(parseFloat(newTime.toFixed(1)));
        }
      } else if (currentStatus === 'running') {
        const elapsed = (now - stateRef.current.runningStartTime) / 1000;
        
        // Multiplier climbs exponentially matching server formula
        const currentMult = parseFloat(Math.pow(1.072, elapsed * 1.5).toFixed(2));
        const limitCrash = stateRef.current.crashPoint;

        if (currentMult >= limitCrash) {
          // Crash Point Tripped!
          stateRef.current.status = 'crashed';
          stateRef.current.multiplier = limitCrash;
          
          setStatus('crashed');
          setMultiplier(limitCrash);
          sfx.playCrash();

          // Write history entry
          const newEntry: RoundHistoryEntry = {
            roundId: stateRef.current.roundId,
            crashPoint: limitCrash,
            serverSeed: stateRef.current.serverSeed,
            serverSeedHash: stateRef.current.serverSeedHash,
            clientSeed: communityClientSeed,
            nonce: stateRef.current.nonce,
            timestamp: now
          };

          const updatedHistory = [newEntry, ...stateRef.current.history].slice(0, 30);
          stateRef.current.history = updatedHistory;
          setRoundHistory(updatedHistory);
          localStorage.setItem('aviator_history_v2', JSON.stringify(updatedHistory));

          // Reset betting stage in 3 seconds
          setTimeout(async () => {
            stateRef.current.status = 'betting';
            stateRef.current.timeLeft = 6.0;
            stateRef.current.multiplier = 1.0;
            stateRef.current.activeBets = [];
            
            await setupNextRound();
            
            setStatus('betting');
            setTimeLeft(6.0);
            setMultiplier(1.0);
            setActiveBets([]);
          }, 3000);
        } else {
          stateRef.current.multiplier = currentMult;
          setMultiplier(currentMult);

          // Iterate and evaluate cashed-out players
          let anyChange = false;
          const updatedBets = stateRef.current.activeBets.map((bet) => {
            if (bet.cashedOut) return bet;

            // User Auto-Cashout evaluation
            if (!bet.isSimulated && bet.autoCashout && currentMult >= bet.autoCashout) {
              const payout = parseFloat((bet.amount * bet.autoCashout).toFixed(2));
              updateBalance(stateRef.current.balance + payout);
              sfx.playCashout();
              anyChange = true;
              return {
                ...bet,
                cashedOut: true,
                cashoutMultiplier: bet.autoCashout,
                payout
              };
            }

            // Multiplayer Bot Cashout evaluation
            if (bet.isSimulated) {
              const b = bet as any;
              const shouldCashout = 
                (b.autoCashout && currentMult >= b.autoCashout) ||
                (b.targetMultiplier && currentMult >= b.targetMultiplier);
              
              if (shouldCashout) {
                const cashoutMult = b.autoCashout || b.targetMultiplier;
                const payout = parseFloat((b.amount * cashoutMult).toFixed(2));
                anyChange = true;

                // Random bot commentary
                if (Math.random() < 0.15) {
                  const botMsgs = [
                    `Cashed out at ${cashoutMult}x!`,
                    `Secure profit at ${cashoutMult}x.`,
                    `Awesome! +$${payout.toFixed(0)}`,
                    `Cashed out successfully.`,
                    `Out at ${cashoutMult}x.`
                  ];
                  const randomMsg = botMsgs[Math.floor(Math.random() * botMsgs.length)];
                  setChatLog((prev) => {
                    const logs = [...prev, { sender: bet.playerName, message: randomMsg, timestamp: Date.now() }];
                    if (logs.length > 40) logs.shift();
                    localStorage.setItem('aviator_chat_v2', JSON.stringify(logs));
                    return logs;
                  });
                }

                return {
                  ...bet,
                  cashedOut: true,
                  cashoutMultiplier: cashoutMult,
                  payout
                };
              }
            }

            return bet;
          });

          if (anyChange) {
            stateRef.current.activeBets = updatedBets;
            setActiveBets(updatedBets);
          }
        }
      }
    };

    timer = setInterval(tick, 100);

    return () => {
      clearInterval(timer);
      clearInterval(chatTimer);
    };
  }, [currentUser]);

  // Auth Submit Action handler
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    // Simulate network latency delay
    setTimeout(() => {
      const email = emailInput.trim();
      const password = passwordInput.trim();

      if (!email || !password) {
        setAuthError('All fields are required.');
        setAuthLoading(false);
        return;
      }

      let matchedUser = null;
      const registeredUsersJson = localStorage.getItem('aviator_registered_users');
      let registeredUsers = registeredUsersJson ? JSON.parse(registeredUsersJson) : [];

      if (authMode === 'login') {
        matchedUser = registeredUsers.find((u: any) => u.email === email);
        if (!matchedUser) {
          // Auto register / login standard demo fallback credentials
          matchedUser = { id: Date.now(), username: email.split('@')[0], email, balance: 1000.0, isAdmin: false };
          registeredUsers.push(matchedUser);
          localStorage.setItem('aviator_registered_users', JSON.stringify(registeredUsers));
        }
      } else {
        const username = usernameInput.trim() || email.split('@')[0];
        const exists = registeredUsers.some((u: any) => u.email === email);
        if (exists) {
          setAuthError('Email already registered.');
          setAuthLoading(false);
          return;
        }

        matchedUser = { id: Date.now(), username, email, balance: 1000.0, isAdmin: false };
        registeredUsers.push(matchedUser);
        localStorage.setItem('aviator_registered_users', JSON.stringify(registeredUsers));
      }

      const dummyToken = `demo-session-${Date.now()}`;
      localStorage.setItem('aviator_token', dummyToken);
      localStorage.setItem('aviator_current_user', JSON.stringify(matchedUser));
      
      setToken(dummyToken);
      setCurrentUser(matchedUser);
      
      const cachedBalance = localStorage.getItem(`aviator_balance_${email}`);
      const balanceToLoad = cachedBalance ? parseFloat(cachedBalance) : matchedUser.balance;
      setBalance(balanceToLoad);
      stateRef.current.balance = balanceToLoad;

      setAuthLoading(false);
    }, 500);
  };

  const handleLogout = () => {
    localStorage.removeItem('aviator_token');
    localStorage.removeItem('aviator_current_user');
    setToken(null);
    setCurrentUser(null);
  };

  // SFX Controller Mute switch
  const toggleMute = () => {
    setIsMuted(!isMuted);
    sfx.enabled = isMuted;
  };

  // Place Bet trigger Action
  const handlePlaceBet = (amount: number, autoCashout?: number) => {
    if (amount <= 0 || amount > balance) {
      alert('Insufficient balance or invalid bet amount!');
      return;
    }

    // Deduct player balance
    updateBalance(stateRef.current.balance - amount);

    if (stateRef.current.status === 'betting') {
      const userBet: Bet = {
        id: `real-${currentUser.id}-${Date.now()}`,
        playerId: `real-${currentUser.id}`,
        playerName: currentUser.username,
        amount,
        autoCashout,
        cashedOut: false,
        isSimulated: false,
        timestamp: Date.now()
      };
      
      const newBets = [...stateRef.current.activeBets, userBet];
      stateRef.current.activeBets = newBets;
      setActiveBets(newBets);
    } else {
      // Queue bet for the next round transition
      stateRef.current.queuedBets.push({ amount, autoCashout });
      alert('Flight in progress. Your bet has been queued for the next round!');
    }
  };

  // Cash Out Action trigger
  const handleCashOut = () => {
    if (stateRef.current.status !== 'running') return;

    const userBetIndex = stateRef.current.activeBets.findIndex(
      b => b.playerId === `real-${currentUser.id}` && !b.cashedOut
    );

    if (userBetIndex === -1) return;

    const currentMult = stateRef.current.multiplier;
    const bet = stateRef.current.activeBets[userBetIndex];
    const payout = parseFloat((bet.amount * currentMult).toFixed(2));

    updateBalance(stateRef.current.balance + payout);
    sfx.playCashout();

    const updatedBets = [...stateRef.current.activeBets];
    updatedBets[userBetIndex] = {
      ...bet,
      cashedOut: true,
      cashoutMultiplier: currentMult,
      payout
    };

    stateRef.current.activeBets = updatedBets;
    setActiveBets(updatedBets);
  };

  // Send Community Chat Action
  const handleSendMessage = (msgText: string) => {
    if (!msgText.trim()) return;

    const newChat = {
      sender: currentUser.username,
      message: msgText.trim(),
      timestamp: Date.now()
    };

    setChatLog((prev) => {
      const logs = [...prev, newChat];
      if (logs.length > 40) logs.shift();
      localStorage.setItem('aviator_chat_v2', JSON.stringify(logs));
      return logs;
    });
  };

  // Refill balance Action
  const handleResetBalance = () => {
    updateBalance(1000.0);
  };

  const lastCompletedRound = roundHistory[0] ? {
    roundId: roundHistory[0].roundId,
    crashPoint: roundHistory[0].crashPoint,
    serverSeed: roundHistory[0].serverSeed,
    serverSeedHash: roundHistory[0].serverSeedHash,
    clientSeed: roundHistory[0].clientSeed,
    nonce: roundHistory[0].nonce,
  } : undefined;

  // Render Login / Registration Screen if not authenticated
  if (!token || !currentUser) {
    return (
      <div className="min-h-screen bg-[#070a0f] text-slate-100 font-sans flex items-center justify-center p-4 selection:bg-red-500/30 selection:text-red-200">
        <div className="w-full max-w-md bg-[#0a0d14] border border-slate-900 rounded-2xl shadow-2xl p-6 md:p-8 space-y-6">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="rounded-2xl bg-red-600 p-3.5 text-slate-950 animate-pulse shadow-lg shadow-red-600/20">
              <Plane size={28} className="rotate-45" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-slate-50 flex items-center gap-1.5 justify-center">
                Aviator <span className="text-red-500">Crash</span>
              </h1>
              <p className="text-xs text-slate-500 mt-1 font-medium">Multiplayer state-synchronized provably fair game service</p>
            </div>
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-900">
            <button
              onClick={() => { setAuthMode('login'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                authMode === 'login'
                  ? 'bg-slate-800 text-slate-100 border border-slate-700/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('register'); setAuthError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                authMode === 'register'
                  ? 'bg-slate-800 text-slate-100 border border-slate-700/50 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authError && (
              <div className="p-3 text-xs bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 font-medium">
                {authError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-3 text-slate-500" />
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-amber-500/50 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500/20 text-slate-200 placeholder:text-slate-600 transition-all"
                />
              </div>
            </div>

            {authMode === 'register' && (
              <div className="space-y-1.5 animate-fadeIn">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Username</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Pilot_Streak_77"
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-amber-500/50 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500/20 text-slate-200 placeholder:text-slate-600 transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Key size={15} className="absolute left-3 top-3 text-slate-500" />
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-amber-500/50 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500/20 text-slate-200 placeholder:text-slate-600 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-amber-500 hover:bg-amber-400 font-bold text-xs uppercase tracking-wider py-3 rounded-xl shadow-lg shadow-amber-500/10 hover:shadow-amber-400/20 transition-all duration-200 active:scale-[0.98] mt-2 flex items-center justify-center gap-2 text-slate-950"
            >
              {authLoading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <span>{authMode === 'login' ? 'Launch Cabin' : 'Create Account'}</span>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-900/50 text-center">
            <span className="text-[10px] text-slate-500 font-medium">
              Staging / Demo Mode: Register any email to play instantly.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Active Game screen
  return (
    <div className="min-h-screen bg-[#070a0f] text-slate-100 font-sans selection:bg-amber-500/30 selection:text-amber-200 animate-fadeIn">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-900 bg-[#0a0d14]/90 backdrop-blur-md px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-500 p-2 text-slate-950 animate-pulse shadow-md shadow-amber-500/20">
              <Plane size={18} className="rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black uppercase tracking-wider text-slate-100">Aviator</span>
                <span className="rounded bg-amber-500/10 px-1 py-0.2 text-[9px] font-black text-amber-500 border border-amber-500/20">DEMO</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                <Server size={10} className="text-slate-600" />
                <span>Round: {roundId || '---'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* SFX Controller */}
            <button
              onClick={toggleMute}
              className="rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2 text-slate-400 hover:text-slate-200 transition"
              title={isMuted ? 'Unmute SFX' : 'Mute SFX'}
            >
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            {/* User details */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-900">
              <User size={14} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-300">{currentUser.username}</span>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-850 p-2 text-slate-400 hover:text-amber-400 transition"
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>

            {/* WS Status connection badge (Always Synced for standalone offline operations) */}
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden sm:inline">
                Synced
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid content */}
      <main className="max-w-7xl mx-auto p-4 space-y-4">
        
        {/* History multipliers bar */}
        <RecentHistory history={roundHistory} />

        {/* Dynamic Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          
          {/* Main Visual Arena */}
          <div className="lg:col-span-2">
            <GameCanvas
              status={status}
              multiplier={multiplier}
              timeLeft={timeLeft}
            />
          </div>

          {/* Control Stakes panel */}
          <div className="lg:col-span-1 lg:row-span-2">
            <BetControl
              status={status}
              multiplier={multiplier}
              balance={balance}
              activeBets={activeBets}
              playerId={`real-${currentUser.id}`}
              playerName={currentUser.username}
              onPlaceBet={handlePlaceBet}
              onCashOut={handleCashOut}
              onResetBalance={handleResetBalance}
            />
          </div>

          {/* Lobby Community / Audit utilities */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-900">
              <button
                onClick={() => setActiveTab('lobby')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'lobby'
                    ? 'bg-slate-800 text-slate-100 border border-slate-700/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🎮 Active Lobby & Community
              </button>
              
              <button
                onClick={() => setActiveTab('fairness')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'fairness'
                    ? 'bg-slate-800 text-slate-100 border border-slate-700/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🛡️ Provably Fair Auditor
              </button>
            </div>

            {activeTab === 'lobby' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BetBoard
                  activeBets={activeBets}
                  playerId={`real-${currentUser.id}`}
                  roundHistory={roundHistory}
                />

                <ChatRoom
                  chatLog={chatLog}
                  playerName={currentUser.username}
                  onSendMessage={handleSendMessage}
                />
              </div>
            ) : (
              <ProvablyFairUI
                currentNonce={currentNonce}
                communityClientSeed={communityClientSeed}
                lastRound={lastCompletedRound}
              />
            )}
          </div>
        </div>

        {/* Bottom Provably Fair info banner */}
        <div className="rounded-xl border border-slate-900 bg-slate-950/40 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-500 shrink-0">
              <Shield size={20} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">How do I verify a flight?</h4>
              <p className="text-[11px] text-slate-400 mt-1">
                We use an open-source cryptographic commitment. Paste the <strong>Server Seed</strong>, <strong>Client Seed</strong>, and <strong>Nonce</strong> into the Auditor tab to verify that the math yields the exact crash point!
              </p>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              onClick={() => setActiveTab('fairness')}
              className="rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 text-xs font-bold text-slate-300 transition"
            >
              Auditor Tool
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
