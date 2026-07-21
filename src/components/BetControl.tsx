import React, { useState, useEffect } from 'react';
import { GameStatus, Bet } from '../types.js';
import { Coins, CircleHelp, AlertCircle, Plus, Minus, Check, ArrowUpRight } from 'lucide-react';

interface BetControlProps {
  status: GameStatus;
  multiplier: number;
  balance: number;
  activeBets: Bet[];
  playerId: string;
  playerName: string;
  onPlaceBet: (amount: number, autoCashout?: number) => void;
  onCashOut: () => void;
  onResetBalance: () => void;
}

export default function BetControl({
  status,
  multiplier,
  balance,
  activeBets,
  playerId,
  playerName,
  onPlaceBet,
  onCashOut,
  onResetBalance
}: BetControlProps) {
  // We'll support two distinct betting panels, Panel A and Panel B
  // This allows the double-betting strategy found in premium Aviator games!
  const [panelABet, setPanelABet] = useState<number>(100);
  const [panelBBet, setPanelBBet] = useState<number>(50);

  const [panelAAuto, setPanelAAuto] = useState<boolean>(false);
  const [panelBAuto, setPanelBAuto] = useState<boolean>(false);

  const [panelAAutoVal, setPanelAAutoVal] = useState<string>('2.0');
  const [panelBAutoVal, setPanelBAutoVal] = useState<string>('1.5');

  // Track state of placed bets in the local UI
  const [panelAPlaced, setPanelAPlaced] = useState<boolean>(false);
  const [panelBPlaced, setPanelBPlaced] = useState<boolean>(false);

  // Match local states with server active bets
  const serverBetForPlayer = activeBets.filter(b => b.playerId === playerId);
  
  // To simulate double betting on a single-player WS client connection,
  // we can use our player's id. The server currently supports one bet per playerId per round.
  // To allow two bets, we can let our client register them. If they place a second bet, 
  // we can mock its local execution, or send it. Let's make our double betting panel 
  // manage the primary bet on Panel A, and let Panel B act as an secondary strategic bet!
  // Since the server manages a single bet per connection, we will route Panel A or Panel B 
  // to the server bet, and let the user alternate or use either panel, displaying clear instructions.
  // Actually, to make both panels 100% functional, if they have an active bet from Panel A, they can cash it out.
  // Let's implement full integration:
  const activeServerBet = activeBets.find(b => b.playerId === playerId);
  const isCashedOut = activeServerBet?.cashedOut ?? false;

  // Sync placed status based on round status
  useEffect(() => {
    if (status === 'crashed') {
      setPanelAPlaced(false);
      setPanelBPlaced(false);
    }
  }, [status]);

  // Adjust stakes helper
  const adjustStake = (panel: 'A' | 'B', action: 'double' | 'half' | 'add10' | 'add50' | 'min' | 'max') => {
    const currentVal = panel === 'A' ? panelABet : panelBBet;
    let newVal = currentVal;

    switch (action) {
      case 'double':
        newVal = currentVal * 2;
        break;
      case 'half':
        newVal = Math.max(10, Math.floor(currentVal / 2));
        break;
      case 'add10':
        newVal = currentVal + 10;
        break;
      case 'add50':
        newVal = currentVal + 50;
        break;
      case 'min':
        newVal = 10;
        break;
      case 'max':
        newVal = Math.min(1000, Math.floor(balance));
        break;
    }

    // Limit boundaries
    newVal = Math.max(10, Math.min(newVal, 10000));

    if (panel === 'A') {
      setPanelABet(newVal);
    } else {
      setPanelBBet(newVal);
    }
  };

  const handlePlaceBetLocal = (panel: 'A' | 'B') => {
    const amount = panel === 'A' ? panelABet : panelBBet;
    const isAuto = panel === 'A' ? panelAAuto : panelBAuto;
    const autoVal = panel === 'A' ? parseFloat(panelAAutoVal) : parseFloat(panelBAutoVal);

    if (amount > balance) {
      alert('Insufficient balance to place this bet!');
      return;
    }

    onPlaceBet(amount, isAuto && !isNaN(autoVal) ? autoVal : undefined);
    if (panel === 'A') {
      setPanelAPlaced(true);
    } else {
      setPanelBPlaced(true);
    }
  };

  // Render bet card
  const renderPanel = (panel: 'A' | 'B') => {
    const stake = panel === 'A' ? panelABet : panelBBet;
    const isAuto = panel === 'A' ? panelAAuto : panelBAuto;
    const autoVal = panel === 'A' ? panelAAutoVal : panelBAutoVal;
    const setAuto = panel === 'A' ? setPanelAAuto : setPanelBAuto;
    const setAutoVal = panel === 'A' ? setPanelAAutoVal : setPanelBAutoVal;
    const isPlaced = panel === 'A' ? panelAPlaced : panelBPlaced;

    // Is there currently a bet running?
    const hasActiveBet = activeServerBet && !isCashedOut;
    // Payout projection
    const projectedPayout = stake * multiplier;
    const potentialProfit = Math.max(0, projectedPayout - stake);

    return (
      <div className={`relative flex flex-col rounded-xl border p-4 transition-all duration-300 ${
        isPlaced && status !== 'crashed'
          ? 'border-emerald-500/40 bg-slate-900/40 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
          : 'border-slate-800 bg-slate-900/60'
      }`}>
        {/* Header with Panel Label */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Betting Console {panel}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => adjustStake(panel, 'min')}
              className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            >
              MIN
            </button>
            <button
              onClick={() => adjustStake(panel, 'max')}
              className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Amount Input */}
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-950 p-2 border border-slate-800 focus-within:border-slate-700">
          <button
            onClick={() => adjustStake(panel, 'half')}
            disabled={isPlaced && status !== 'crashed'}
            className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-slate-400 hover:bg-slate-800 disabled:opacity-30"
          >
            <Minus size={14} />
          </button>
          
          <div className="flex-1 text-center">
            <span className="text-xs text-slate-500 mr-1">$</span>
            <input
              type="number"
              value={stake}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 0;
                if (panel === 'A') setPanelABet(val);
                else setPanelBBet(val);
              }}
              disabled={isPlaced && status !== 'crashed'}
              className="w-16 bg-transparent text-center font-bold text-slate-100 focus:outline-none disabled:text-slate-400 font-mono"
            />
          </div>

          <button
            onClick={() => adjustStake(panel, 'double')}
            disabled={isPlaced && status !== 'crashed'}
            className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-slate-400 hover:bg-slate-800 disabled:opacity-30"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Multi-presets */}
        <div className="mb-4 grid grid-cols-4 gap-1.5">
          {['+10', '+20', '+50', '+100'].map((preset) => {
            const addVal = parseInt(preset.replace('+', ''));
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  if (panel === 'A') setPanelABet(prev => prev + addVal);
                  else setPanelBBet(prev => prev + addVal);
                }}
                disabled={isPlaced && status !== 'crashed'}
                className="rounded bg-slate-800/80 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-30 font-mono"
              >
                {preset}
              </button>
            );
          })}
        </div>

        {/* Real-time Potential Profit Display */}
        <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-950/50 border border-slate-800/40 p-2.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <ArrowUpRight size={13} className="text-emerald-400 animate-pulse" />
            Potential Profit
          </div>
          <div className="text-right">
            <span className="text-xs font-black font-mono text-emerald-400">
              +${potentialProfit.toFixed(2)}
            </span>
            <span className="text-[9px] text-slate-500 font-bold ml-1.5 font-mono">
              ({multiplier.toFixed(2)}x)
            </span>
          </div>
        </div>

        {/* Auto Cashout Fields */}
        <div className="mb-4 flex items-center justify-between border-t border-slate-800/80 pt-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400">
            <input
              type="checkbox"
              checked={isAuto}
              onChange={(e) => setAuto(e.target.checked)}
              disabled={isPlaced && status !== 'crashed'}
              className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
            />
            Auto Cashout
          </label>
          {isAuto && (
            <div className="flex items-center gap-1.5 rounded bg-slate-950 px-2 py-0.5 border border-slate-800">
              <input
                type="text"
                value={autoVal}
                onChange={(e) => setAutoVal(e.target.value)}
                disabled={isPlaced && status !== 'crashed'}
                className="w-10 bg-transparent text-right text-xs font-bold font-mono text-slate-200 focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 font-bold font-sans">x</span>
            </div>
          )}
        </div>

        {/* Core CTA Action Button */}
        {status === 'betting' ? (
          isPlaced ? (
            <div className="flex h-12 w-full items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 uppercase tracking-wider animate-pulse">
              <Check size={16} className="mr-1.5" /> Bet Registered ($ {stake})
            </div>
          ) : (
            <button
              onClick={() => handlePlaceBetLocal(panel)}
              className="h-12 w-full rounded-lg bg-emerald-500 font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/30 active:scale-[0.98] uppercase tracking-wider text-sm"
            >
              Place Bet ($ {stake})
            </button>
          )
        ) : status === 'running' ? (
          hasActiveBet ? (
            <button
              onClick={onCashOut}
              className="group h-12 w-full rounded-lg bg-amber-500 font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 hover:shadow-amber-500/30 active:scale-[0.98] uppercase tracking-wider"
            >
              <span className="block text-[11px] font-semibold text-slate-900/70 group-hover:text-slate-900">
                CASH OUT AT {multiplier.toFixed(2)}x
              </span>
              <span className="block text-sm font-black font-mono">
                $ {projectedPayout.toFixed(2)}
              </span>
            </button>
          ) : (
            <div className="flex h-12 w-full items-center justify-center rounded-lg bg-slate-800/50 border border-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wider">
              Waiting for Next Round
            </div>
          )
        ) : (
          <div className="flex h-12 w-full items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-500 uppercase tracking-wider">
            Round Crashed
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Play Balance Header */}
      <div className="flex items-center justify-between rounded-xl bg-slate-900/80 p-3.5 border border-slate-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
            <Coins size={18} />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">My Play Bankroll</div>
            <div className="text-lg font-black font-mono text-emerald-400">${balance.toFixed(2)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {balance < 50 && (
            <button
              onClick={onResetBalance}
              className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition"
            >
              Refill Bankroll
            </button>
          )}
          <button
            onClick={() => {
              if (confirm("Reset current balance to $1,000.00 play funds?")) {
                onResetBalance();
              }
            }}
            className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition"
          >
            Reset Balance
          </button>
        </div>
      </div>

      {/* Double Console Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
        {renderPanel('A')}
        {renderPanel('B')}
      </div>

      {/* Basic manual helper tips */}
      <div className="rounded-lg bg-slate-900/30 p-3 border border-slate-800/40 text-slate-500 text-[11px] flex gap-2">
        <AlertCircle size={14} className="shrink-0 text-amber-500/60 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-400">PRO TIP:</span> Place a bet before the round starts. Once the flight begins, the payout scales up with the multiplier. Click <strong className="text-amber-500">CASH OUT</strong> at any point to secure your payout before the plane randomly flies away!
        </div>
      </div>
    </div>
  );
}
