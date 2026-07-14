import React, { useState, useEffect, useRef } from 'react';
import GameCanvas from './components/GameCanvas.js';
import BetControl from './components/BetControl.js';
import BetBoard from './components/BetBoard.js';
import ProvablyFairUI from './components/ProvablyFairUI.js';
import RecentHistory from './components/RecentHistory.js';
import ChatRoom from './components/ChatRoom.js';
import { GameStatus, Bet, RoundHistoryEntry } from './types.js';
import { Plane, Shield, Volume2, VolumeX, User, Server, Key, Mail, RefreshCw, LogOut } from 'lucide-react';

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

    // Ascending propeller pitch sound
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

    // High pitched "ding-ding" success sound
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5
    osc1.frequency.setValueAtTime(659.25, this.ctx.currentTime + 0.1); // E5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1046.50, this.ctx.currentTime); // C6

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

    // Sweeping white-noise-like explosion crash
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
  // Authentication states
  const [token, setToken] = useState<string | null>(localStorage.getItem('aviator_token'));
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Connection states
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [wsError, setWsError] = useState<string | null>(null);

  // Game loop synced states
  const [status, setStatus] = useState<GameStatus>('betting');
  const [multiplier, setMultiplier] = useState(1.0);
  const [timeLeft, setTimeLeft] = useState(6.0);
  const [roundId, setRoundId] = useState('');
  const [serverSeedHash, setServerSeedHash] = useState('');
  const [activeBets, setActiveBets] = useState<Bet[]>([]);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryEntry[]>([]);
  const [balance, setBalance] = useState(1000.00);
  const [chatLog, setChatLog] = useState<{ sender: string; message: string; timestamp: number; isSystem?: boolean }[]>([]);
  const [currentNonce, setCurrentNonce] = useState(1);
  const [communityClientSeed, setCommunityClientSeed] = useState('aviator-community-seed');

  // Sidebar utility active pane
  const [activeTab, setActiveTab] = useState<'lobby' | 'fairness'>('lobby');
  const [isMuted, setIsMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch / Verify Auth Profile on mount or token changes
  useEffect(() => {
    if (!token) {
      setCurrentUser(null);
      return;
    }

    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok && data.user) {
          setCurrentUser(data.user);
          setBalance(data.user.balance);
        } else {
          // Token expired or invalid
          handleLogout();
        }
      } catch (err) {
        console.error('Failed to verify session token:', err);
      }
    };

    fetchProfile();
  }, [token]);

  // Connect to the full-stack authenticated WebSocket server
  useEffect(() => {
    if (!token || !currentUser) return;

    let socket: WebSocket;
    let reconnectTimeout: any;

    const connect = () => {
      setConnectionStatus('connecting');
      setWsError(null);

      // Pass JWT as query parameter for secure server-side auth
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
      console.log(`[WS] Connecting to authenticated WebSocket...`);

      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnectionStatus('connected');
        console.log('[WS] Connection open and authenticated.');
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { type, payload } = data;

          switch (type) {
            case 'init': {
              setStatus(payload.status);
              setMultiplier(payload.multiplier);
              setTimeLeft(payload.timeLeft);
              setRoundId(payload.currentRoundId);
              setServerSeedHash(payload.serverSeedHash);
              setActiveBets(payload.activeBets);
              setRoundHistory(payload.roundHistory);
              setBalance(payload.balance);
              setChatLog(payload.chatLog);
              setCurrentNonce(payload.nonce);
              setCommunityClientSeed(payload.clientSeed);
              break;
            }

            case 'betting_start': {
              setStatus('betting');
              setTimeLeft(payload.timeLeft);
              setRoundId(payload.roundId);
              setServerSeedHash(payload.serverSeedHash);
              setActiveBets(payload.activeBets);
              setCurrentNonce(payload.nonce);
              break;
            }

            case 'tick_betting': {
              setTimeLeft(payload.timeLeft);
              break;
            }

            case 'round_start': {
              setStatus('running');
              setMultiplier(1.0);
              setActiveBets(payload.activeBets);
              setRoundId(payload.roundId);
              sfx.playStart();
              break;
            }

            case 'tick': {
              setMultiplier(payload.multiplier);
              setActiveBets(payload.activeBets);
              break;
            }

            case 'crash': {
              setStatus('crashed');
              setMultiplier(payload.crashPoint);
              setRoundHistory(payload.roundHistory);
              sfx.playCrash();
              break;
            }

            case 'bet_placed': {
              setActiveBets((prev) => {
                const exists = prev.some(b => b.id === payload.bet.id);
                if (exists) return prev;
                return [...prev, payload.bet];
              });
              break;
            }

            case 'cash_out_success': {
              setActiveBets((prev) =>
                prev.map((b) =>
                  b.id === payload.betId
                    ? { ...b, cashedOut: true, cashoutMultiplier: payload.multiplier, payout: payload.payout }
                    : b
                )
              );

              // Play visual sound if it was me!
              if (payload.playerId === `real-${currentUser.id}`) {
                sfx.playCashout();
              }
              break;
            }

            case 'balance_update': {
              setBalance(payload.balance);
              break;
            }

            case 'chat_message': {
              setChatLog((prev) => {
                const logs = [...prev, payload];
                if (logs.length > 40) logs.shift();
                return logs;
              });
              break;
            }

            case 'error': {
              console.warn('[WS Server Alert]:', payload.message);
              alert(`Game Alert: ${payload.message}`);
              break;
            }
          }
        } catch (e) {
          console.error('Error handling WebSocket message:', e);
        }
      };

      socket.onerror = (err) => {
        console.error('[WS Client Error]:', err);
        setWsError('Server connection error. Reconnecting...');
      };

      socket.onclose = () => {
        setConnectionStatus('disconnected');
        console.log('[WS] Connection closed.');
        reconnectTimeout = setTimeout(connect, 4000);
      };
    };

    connect();

    return () => {
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [token, currentUser]);

  // Handle Auth submission
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body: any = { email: emailInput.trim(), password: passwordInput };
    if (authMode === 'register') {
      body.username = usernameInput.trim();
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      
      if (res.ok && data.token) {
        localStorage.setItem('aviator_token', data.token);
        setToken(data.token);
        setCurrentUser(data.user);
        setBalance(data.user.balance);
      } else {
        setAuthError(data.error || 'Authentication failed. Please try again.');
      }
    } catch (err) {
      setAuthError('Unable to connect to authentication server.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('aviator_token');
    setToken(null);
    setCurrentUser(null);
    setConnectionStatus('disconnected');
    if (wsRef.current) wsRef.current.close();
  };

  // SFX Controller Toggle
  const toggleMute = () => {
    setIsMuted(!isMuted);
    sfx.enabled = isMuted;
  };

  // Place Bet trigger
  const handlePlaceBet = (amount: number, autoCashout?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'place_bet',
        payload: {
          amount,
          autoCashout
        }
      }));
    }
  };

  // Cash Out trigger
  const handleCashOut = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cash_out'
      }));
    }
  };

  // Send Community Chat
  const handleSendMessage = (msgText: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat',
        payload: { message: msgText }
      }));
    }
  };

  // Refill balance
  const handleResetBalance = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'reset_balance'
      }));
    }
  };

  // Get last round for verification
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
          {/* Brand Logo Header */}
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

          {/* Tab Selection */}
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

          {/* Form */}
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authError && (
              <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 font-medium">
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
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-red-500/50 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-red-500/20 text-slate-200 placeholder:text-slate-600 transition-all"
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
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-red-500/50 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-red-500/20 text-slate-200 placeholder:text-slate-600 transition-all"
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
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-red-500/50 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-red-500/20 text-slate-200 placeholder:text-slate-600 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-red-600 hover:bg-red-500 font-bold text-xs uppercase tracking-wider py-3 rounded-xl shadow-lg shadow-red-600/10 hover:shadow-red-500/20 transition-all duration-200 active:scale-[0.98] mt-2 flex items-center justify-center gap-2 text-slate-950"
            >
              {authLoading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <span>{authMode === 'login' ? 'Launch Cabin' : 'Create Account'}</span>
              )}
            </button>
          </form>

          {/* Sandbox Info */}
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
    <div className="min-h-screen bg-[#070a0f] text-slate-100 font-sans selection:bg-red-500/30 selection:text-red-200">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-900 bg-[#0a0d14]/90 backdrop-blur-md px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-red-600 p-2 text-slate-950 animate-pulse shadow-md shadow-red-600/20">
              <Plane size={18} className="rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black uppercase tracking-wider text-slate-100">Aviator</span>
                <span className="rounded bg-red-500/10 px-1 py-0.2 text-[9px] font-black text-red-500 border border-red-500/20">CRASH</span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                <Server size={10} className="text-slate-600" />
                <span>Round: {roundId || '---'}</span>
              </div>
            </div>
          </div>

          {/* Profile controls and connection state */}
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
              className="rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-850 p-2 text-slate-400 hover:text-red-400 transition"
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>

            {/* WS Status connection badge */}
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${
                connectionStatus === 'connected' 
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-red-500 animate-ping'
              }`}></span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden sm:inline">
                {connectionStatus === 'connected' ? 'Synced' : connectionStatus === 'connecting' ? 'Connecting' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid content */}
      <main className="max-w-7xl mx-auto p-4 space-y-4">
        
        {/* Reconnecting overlay message */}
        {connectionStatus !== 'connected' && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-xs text-amber-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span>
                {wsError || 'Establishing real-time synchronization link...'}
              </span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-amber-500 px-3 py-1 text-[11px] font-bold text-slate-950 uppercase tracking-wider"
            >
              Force Reload
            </button>
          </div>
        )}

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
            {/* Tab switch controller */}
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

            {/* Tab Panels */}
            {activeTab === 'lobby' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Real-time active board */}
                <BetBoard
                  activeBets={activeBets}
                  playerId={`real-${currentUser.id}`}
                  roundHistory={roundHistory}
                />

                {/* Live synchronized Chat */}
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
