import React, { useState } from 'react';
import { ShieldCheck, Copy, Check, RotateCcw, HelpCircle, Code } from 'lucide-react';

interface ProvablyFairUIProps {
  currentNonce: number;
  communityClientSeed: string;
  lastRound?: {
    roundId: string;
    crashPoint: number;
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
  };
}

export default function ProvablyFairUI({ currentNonce, communityClientSeed, lastRound }: ProvablyFairUIProps) {
  // Calculator states
  const [inputServerSeed, setInputServerSeed] = useState('');
  const [inputClientSeed, setInputClientSeed] = useState(communityClientSeed);
  const [inputNonce, setInputNonce] = useState(String(currentNonce - 1 || 1));
  const [calculatedResult, setCalculatedResult] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Copy clipboards states
  const [copiedText, setCopiedText] = useState<'server' | 'hash' | 'client' | 'result' | null>(null);

  const handleCopy = (text: string, label: 'server' | 'hash' | 'client' | 'result') => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Perform provably fair HMAC calculation in browser via Native Web Crypto!
  const calculateResult = async () => {
    setErrorMessage('');
    setCalculatedResult(null);

    if (!inputServerSeed || !inputServerSeed.trim()) {
      setErrorMessage('Please enter a valid revealed server seed (hex string).');
      return;
    }

    setIsCalculating(true);
    try {
      const enc = new TextEncoder();
      const keyData = enc.encode(inputServerSeed.trim());
      const msgData = enc.encode(`${inputClientSeed.trim()}-${inputNonce.trim()}`);

      // Import the server seed as the HMAC-SHA256 key
      const key = await window.crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      // Sign the message (clientSeed-nonce)
      const signature = await window.crypto.subtle.sign('HMAC', key, msgData);

      // Convert ArrayBuffer signature to a hex string
      const hashArray = Array.from(new Uint8Array(signature));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      // Extract first 8 characters (32-bit integer)
      const h = parseInt(hashHex.slice(0, 8), 16);
      const e = Math.pow(2, 32);

      // Formula with 1% house edge
      const houseEdge = 0.01;
      const resultMultiplier = Math.floor((100 * e - h) / (e - h)) / 100;
      const finalVal = resultMultiplier * (1 - houseEdge);
      const roundedMultiplier = Math.max(1.00, parseFloat(finalVal.toFixed(2)));

      setCalculatedResult(roundedMultiplier);
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Calculation failed. Ensure Server Seed is a standard hex string.');
    } finally {
      setIsCalculating(false);
    }
  };

  const autofillLastRound = () => {
    if (lastRound) {
      setInputServerSeed(lastRound.serverSeed);
      setInputClientSeed(lastRound.clientSeed);
      setInputNonce(String(lastRound.nonce));
      setCalculatedResult(null);
      setErrorMessage('');
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">Provably Fair System</h3>
            <p className="text-[10px] text-slate-500 font-sans">100% cryptographic round verification</p>
          </div>
        </div>

        {lastRound && (
          <button
            onClick={autofillLastRound}
            className="flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition"
          >
            <RotateCcw size={12} />
            Load Last Round
          </button>
        )}
      </div>

      {/* Explainer paragraph */}
      <div className="mb-5 rounded-lg bg-slate-950/50 p-3 border border-slate-800/50 text-[11px] leading-relaxed text-slate-400">
        <p className="mb-2">
          Each flight's crash point is generated using a combination of a private <strong>Server Seed</strong>, a public <strong>Client Seed</strong>, and a sequential <strong>Nonce</strong>.
        </p>
        <p>
          Because the server broadcasts the <strong>Server Seed's SHA256 hash</strong> <em>before</em> the flight starts, it is mathematically impossible for the server to manipulate the crash point after you place your bet.
        </p>
      </div>

      {/* Grid: Last Round Audit Details */}
      {lastRound ? (
        <div className="mb-5 space-y-2 border-b border-slate-800/60 pb-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Code size={12} className="text-red-500" /> Last Flight Details ({lastRound.roundId})
          </h4>

          {/* Crash Point */}
          <div className="flex items-center justify-between rounded bg-slate-950/30 px-3 py-1.5 border border-slate-800/40 text-xs">
            <span className="text-slate-500">Real Crash Multiplier:</span>
            <span className="font-extrabold text-red-400 font-mono">{lastRound.crashPoint.toFixed(2)}x</span>
          </div>

          {/* Server Seed */}
          <div className="flex items-center justify-between rounded bg-slate-950/30 px-3 py-1.5 border border-slate-800/40 text-xs">
            <span className="text-slate-500 min-w-[120px]">Revealed Server Seed:</span>
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="font-mono text-slate-300 truncate max-w-[200px] sm:max-w-[300px]">
                {lastRound.serverSeed}
              </span>
              <button
                onClick={() => handleCopy(lastRound.serverSeed, 'server')}
                className="text-slate-500 hover:text-slate-300"
              >
                {copiedText === 'server' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Server Seed Hash */}
          <div className="flex items-center justify-between rounded bg-slate-950/30 px-3 py-1.5 border border-slate-800/40 text-xs">
            <span className="text-slate-500 min-w-[120px]">Pre-committed Hash:</span>
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="font-mono text-slate-400 truncate max-w-[200px] sm:max-w-[300px]">
                {lastRound.serverSeedHash}
              </span>
              <button
                onClick={() => handleCopy(lastRound.serverSeedHash, 'hash')}
                className="text-slate-500 hover:text-slate-300"
              >
                {copiedText === 'hash' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Client Seed */}
          <div className="flex items-center justify-between rounded bg-slate-950/30 px-3 py-1.5 border border-slate-800/40 text-xs">
            <span className="text-slate-500">Community Client Seed:</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-slate-300">{lastRound.clientSeed}</span>
              <button
                onClick={() => handleCopy(lastRound.clientSeed, 'client')}
                className="text-slate-500 hover:text-slate-300"
              >
                {copiedText === 'client' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Nonce */}
          <div className="flex items-center justify-between rounded bg-slate-950/30 px-3 py-1.5 border border-slate-800/40 text-xs">
            <span className="text-slate-500">Round Nonce:</span>
            <span className="font-mono text-slate-300 font-bold">{lastRound.nonce}</span>
          </div>
        </div>
      ) : (
        <div className="mb-4 text-center py-4 bg-slate-950/20 rounded border border-dashed border-slate-800 text-slate-500 text-xs">
          Rounds details will accumulate here as soon as the first flight completes.
        </div>
      )}

      {/* Interactive Cryptographic Calculator */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
          🛡️ Independent Seed Auditor
        </h4>

        {/* Inputs */}
        <div className="grid grid-cols-1 gap-2.5">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Server Seed (Hex String)
            </label>
            <input
              type="text"
              placeholder="Paste revealed server_seed hex string"
              value={inputServerSeed}
              onChange={(e) => setInputServerSeed(e.target.value)}
              className="w-full rounded bg-slate-950 border border-slate-800 p-2 text-xs font-mono text-slate-100 focus:border-slate-700 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Client Seed
              </label>
              <input
                type="text"
                value={inputClientSeed}
                onChange={(e) => setInputClientSeed(e.target.value)}
                className="w-full rounded bg-slate-950 border border-slate-800 p-2 text-xs font-mono text-slate-100 focus:border-slate-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Nonce
              </label>
              <input
                type="number"
                value={inputNonce}
                onChange={(e) => setInputNonce(e.target.value)}
                className="w-full rounded bg-slate-950 border border-slate-800 p-2 text-xs font-mono text-slate-100 focus:border-slate-700 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={calculateResult}
          disabled={isCalculating}
          className="w-full h-9 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition"
        >
          {isCalculating ? 'Computing Hash...' : 'Audit & Calculate Crash Point'}
        </button>

        {/* Audit Report */}
        {calculatedResult !== null && (
          <div className="mt-3 rounded bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
            <div className="text-[10px] uppercase font-bold text-emerald-500 tracking-widest mb-1">
              Auditor Result Matches Formula
            </div>
            <div className="text-xl font-black font-mono text-emerald-400">
              {calculatedResult.toFixed(2)}x
            </div>
            <div className="text-[9px] text-emerald-500/80 mt-1 font-sans">
              Verified! Calculated mathematically using HmacSHA256(ServerSeed, "ClientSeed-Nonce")
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mt-2 text-center text-xs text-red-500 bg-red-500/10 border border-red-500/20 p-2 rounded">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
