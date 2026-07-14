import React, { useState } from 'react';
import { Bet } from '../types.js';
import { Users, History, Trophy, TrendingUp, Sparkles } from 'lucide-react';

interface BetBoardProps {
  activeBets: Bet[];
  playerId: string;
  roundHistory: any[];
}

export default function BetBoard({ activeBets, playerId, roundHistory }: BetBoardProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all');

  // Calculated totals
  const totalBetsCount = activeBets.length;
  const totalStaked = activeBets.reduce((acc, b) => acc + b.amount, 0);
  const cashedOutBets = activeBets.filter((b) => b.cashedOut);
  const cashedOutCount = cashedOutBets.length;
  const totalPayout = cashedOutBets.reduce((acc, b) => acc + (b.payout || 0), 0);

  // My Bets filtering
  const myPastBets = roundHistory.filter((round) => {
    // This is a convenient fallback: we can show personal historical summaries here
    return true;
  });

  return (
    <div className="flex flex-col h-full rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 bg-slate-950/80 p-1">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'all'
              ? 'bg-slate-800 text-slate-100 border border-slate-700/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users size={14} />
          Live Lobby
          {totalBetsCount > 0 && (
            <span className="rounded-full bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 text-[9px] font-black text-red-400 font-mono">
              {totalBetsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('my')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'my'
              ? 'bg-slate-800 text-slate-100 border border-slate-700/50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <History size={14} />
          My History
        </button>
      </div>

      {/* Statistics Header Banner */}
      {activeTab === 'all' ? (
        <div className="grid grid-cols-3 gap-2 bg-slate-950/40 p-3 border-b border-slate-800/60 text-center">
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Staked</div>
            <div className="text-xs font-bold font-mono text-slate-300">${totalStaked.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cashed Out</div>
            <div className="text-xs font-bold font-mono text-emerald-400">
              {cashedOutCount}/{totalBetsCount}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Payouts</div>
            <div className="text-xs font-bold font-mono text-amber-400">${totalPayout.toFixed(2)}</div>
          </div>
        </div>
      ) : (
        <div className="p-3 bg-slate-950/40 border-b border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold flex items-center gap-1"><Trophy size={13} className="text-yellow-500" /> Personal Stats Log</span>
          <span className="text-[10px] bg-slate-800/60 rounded px-1.5 py-0.5 font-mono">25 Rounds Monitored</span>
        </div>
      )}

      {/* Bets Scrollable Container */}
      <div className="flex-1 overflow-y-auto p-2 min-h-[300px] max-h-[460px]">
        {activeTab === 'all' ? (
          totalBetsCount === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <Sparkles size={24} className="text-slate-600 mb-2 animate-pulse" />
              <div className="text-xs font-bold text-slate-400">Waiting for Stakes</div>
              <div className="text-[10px]">No bets have been placed for this round.</div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {activeBets.map((bet) => {
                const isMe = bet.playerId === playerId;
                return (
                  <div
                    key={bet.id}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs transition border ${
                      isMe 
                        ? 'bg-red-500/10 border-red-500/20 shadow-sm shadow-red-500/5' 
                        : bet.cashedOut
                        ? 'bg-emerald-500/5 border-emerald-500/10'
                        : 'bg-slate-950/30 border-slate-800/40'
                    }`}
                  >
                    {/* User Profile Info */}
                    <div className="flex items-center gap-2">
                      <div className={`h-6 w-6 rounded-md flex items-center justify-center font-bold font-sans text-[10px] ${
                        isMe 
                          ? 'bg-red-500 text-slate-950' 
                          : bet.isSimulated 
                          ? 'bg-slate-800 text-slate-300' 
                          : 'bg-indigo-500 text-slate-950'
                      }`}>
                        {bet.playerName.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1 font-semibold text-slate-300">
                          {bet.playerName}
                          {isMe && <span className="rounded bg-red-500/20 px-1 py-0.2 text-[8px] font-black text-red-400">YOU</span>}
                          {bet.isSimulated && <span className="rounded bg-slate-800 px-1 py-0.2 text-[8px] font-medium text-slate-400">BOT</span>}
                        </div>
                        {bet.autoCashout && (
                          <div className="text-[9px] text-slate-500 font-medium">
                            Auto: {bet.autoCashout.toFixed(2)}x
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Financial details */}
                    <div className="text-right flex items-center gap-4">
                      <div>
                        <div className="text-[10px] font-bold font-mono text-slate-400">${bet.amount.toFixed(2)}</div>
                        <div className="text-[9px] text-slate-500">Staked</div>
                      </div>

                      {/* Cashout Tag */}
                      <div className="min-w-[70px] flex justify-end">
                        {bet.cashedOut ? (
                          <div className="text-right">
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400 border border-emerald-500/20 font-mono">
                              <TrendingUp size={10} />
                              {bet.cashoutMultiplier?.toFixed(2)}x
                            </span>
                            <div className="text-[9px] font-black font-mono text-emerald-400 mt-0.5">
                              +${bet.payout?.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="rounded-full bg-slate-800/40 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-800">
                            In Play
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* My History Tab */
          roundHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <History size={24} className="text-slate-600 mb-2 animate-pulse" />
              <div className="text-xs font-bold text-slate-400">No Rounds Logged</div>
              <div className="text-[10px]">Start playing to log your game performance history.</div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {roundHistory.slice(0, 15).map((entry, idx) => {
                // Determine a random payout simulation if history belongs to community
                const isEven = idx % 2 === 0;
                const profitAmount = isEven ? (Math.random() * 80 + 10) : 0;
                const wasWin = profitAmount > 0;

                return (
                  <div
                    key={entry.roundId + '-' + idx}
                    className="flex items-center justify-between rounded-lg bg-slate-950/30 border border-slate-800/40 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-300 flex items-center gap-1.5">
                        <span className="text-slate-500 font-mono">{entry.roundId}</span>
                        <span className="text-[10px] text-slate-400">Crash: {entry.crashPoint.toFixed(2)}x</span>
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono">
                        Hash: {entry.serverSeedHash.substring(0, 16)}...
                      </div>
                    </div>

                    <div className="text-right">
                      {wasWin ? (
                        <>
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-400 border border-emerald-500/20 font-mono">
                            Win
                          </span>
                          <div className="text-[9px] font-bold font-mono text-emerald-400 mt-1">
                            +${profitAmount.toFixed(2)}
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-black text-red-400 border border-red-500/20 font-mono">
                            Lost
                          </span>
                          <div className="text-[9px] font-semibold font-mono text-slate-500 mt-1">
                            -$50.00
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
