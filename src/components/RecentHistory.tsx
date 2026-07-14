import React, { useState } from 'react';
import { RoundHistoryEntry } from '../types.js';
import { History, Eye, ShieldCheck, X } from 'lucide-react';

interface RecentHistoryProps {
  history: RoundHistoryEntry[];
}

export default function RecentHistory({ history }: RecentHistoryProps) {
  const [selectedRound, setSelectedRound] = useState<RoundHistoryEntry | null>(null);

  if (history.length === 0) {
    return (
      <div className="flex h-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/40 px-4 text-xs text-slate-500 font-sans">
        No past round records available. New flight multipliers will appear here.
      </div>
    );
  }

  // Determine pill style based on multiplier value
  const getMultiplierStyle = (val: number) => {
    if (val < 1.5) {
      return 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:bg-slate-700';
    } else if (val < 2.0) {
      return 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25';
    } else if (val < 10.0) {
      return 'bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/30 font-bold';
    } else {
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 font-black shadow-[0_0_10px_rgba(245,158,11,0.1)]';
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-3 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
        {/* Label */}
        <div className="flex items-center gap-1.5 border-r border-slate-800 pr-3 shrink-0">
          <History size={14} className="text-slate-400" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recent:</span>
        </div>

        {/* Scrollable list of recent multipliers */}
        <div className="flex gap-1.5 overflow-x-auto py-0.5 no-scrollbar flex-1 select-none">
          {history.map((round) => (
            <button
              key={round.roundId}
              onClick={() => setSelectedRound(round)}
              className={`rounded-full px-3 py-1 text-xs font-mono font-bold shrink-0 transition-all cursor-pointer ${getMultiplierStyle(
                round.crashPoint
              )}`}
            >
              {round.crashPoint.toFixed(2)}x
            </button>
          ))}
        </div>
      </div>

      {/* Audit Modal Overlay */}
      {selectedRound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              onClick={() => setSelectedRound(null)}
              className="absolute top-4 right-4 rounded-lg bg-slate-800 hover:bg-slate-700 p-1.5 text-slate-400 hover:text-slate-200"
            >
              <X size={16} />
            </button>

            {/* Header */}
            <div className="mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
              <ShieldCheck className="text-emerald-400" size={20} />
              <div>
                <h3 className="text-sm font-bold text-slate-100">Round audit: {selectedRound.roundId}</h3>
                <p className="text-[10px] text-slate-400">Cryptographic parameter verification</p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between rounded bg-slate-950 p-2.5 border border-slate-800">
                <span className="text-slate-500">Crash Multiplier:</span>
                <span className="font-extrabold text-red-400 font-mono text-sm">
                  {selectedRound.crashPoint.toFixed(2)}x
                </span>
              </div>

              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Revealed Server Seed (Pre-committed SHA256)
                </label>
                <div className="rounded bg-slate-950 p-2 font-mono text-slate-300 break-all border border-slate-800 text-[11px]">
                  {selectedRound.serverSeed}
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Pre-committed Hash (SHA256)
                </label>
                <div className="rounded bg-slate-950 p-2 font-mono text-slate-400 break-all border border-slate-800 text-[11px]">
                  {selectedRound.serverSeedHash}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Client Seed
                  </label>
                  <div className="rounded bg-slate-950 p-2 font-mono text-slate-300 border border-slate-800 text-center">
                    {selectedRound.clientSeed}
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Nonce
                  </label>
                  <div className="rounded bg-slate-950 p-2 font-mono text-slate-300 border border-slate-800 text-center">
                    {selectedRound.nonce}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-5 text-[10px] text-slate-500 text-center flex items-center justify-center gap-1.5 bg-slate-950/40 p-2 rounded border border-slate-800/60">
              <Eye size={12} className="text-emerald-500" />
              Copy these parameters to the Provably Fair Auditor tab to verify results manually.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
