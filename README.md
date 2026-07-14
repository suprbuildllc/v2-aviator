# Cryptographic Aviator-Style Crash Game

An immersive, multiplayer-simulated, and provably fair Aviator-style crash game. This full-stack application utilizes a custom-built **Express server** integrated with native **WebSockets (`ws`)** to coordinate a high-performance 20fps physics/multiplier game loop, multiplayer bot simulation, dynamic bankrolls, and an interactive cryptographic audit tool.

## 🚀 Key Features

- **Full-Stack Real-Time Engine**: Built with a persistent Express server executing a synchronized game loop. Game states (`betting` ➔ `running` ➔ `crashed`) are broadcast in real-time to all clients.
- **Provably Fair Commitments**: Fully verifiable round outcomes. The server pre-commits the SHA256 hash of a secure random server seed before each round begins. The actual seed is revealed after the round, allowing players to cryptographically verify that the crash point was generated in a non-manipulable, deterministic manner.
- **Double-Betting Console**: Styled after premium casino consoles, featuring dual betting panels supporting manual and customizable auto-cashout targets. Play with up to $10,000 of play balance!
- **Interactive Seed Auditor**: A complete in-app verification tool where players can paste the revealed seeds of past rounds to recalculate and mathematically confirm the exact crash multipliers.
- **Animated HTML5 Canvas Flight**: A fluidly animated jet plane visualizer with dynamic trails, acceleration turbulence, parallax clouds, and soft gravity explosion particles when crashing.
- **Live Multiplayer Lobby & Chat**: Multi-user chat and leaderboard logs with automated bots chatting, placing strategic bets, and celebrating or lamenting outcomes alongside the player.
- **Web Audio FX Synthesizer**: Generative, browser-synthesized audio cues (climbing propeller pitches, success bells, and sweeping white-noise explosions) built natively with the Web Audio API (no external asset files required).

---

## 🛡️ Provably Fair Cryptographic Logic

Every flight's crash point is generated deterministically before the round starts using a combination of a secure **Server Seed** (revealed *after* the crash), a community-driven **Client Seed**, and a sequential **Nonce**:

```javascript
const crypto = require('crypto');

function generateCrashPoint(serverSeed, clientSeed, nonce) {
  // 1. Create a secure HMAC signature using SHA256
  const hash = crypto
    .createHmac('sha256', serverSeed)
    .update(`${clientSeed}-${nonce}`)
    .digest('hex');

  // 2. Extract first 8 hex characters (32-bit integer)
  const h = parseInt(hash.slice(0, 8), 16);
  const e = Math.pow(2, 32);

  // 3. Apply formula incorporating a 1% House Edge
  const houseEdge = 0.01;
  const result = Math.floor((100 * e - h) / (e - h)) / 100;

  // 4. Multiply by house edge discount and guarantee minimum of 1.00x
  const finalVal = result * (1 - houseEdge);
  return Math.max(1.00, parseFloat(finalVal.toFixed(2)));
}
```

Since the server broadcasts the **SHA256 Hash of the Server Seed** prior to takeoff, it is mathematically impossible for the platform to manipulate the flight path or crash timing retroactively.

---

## 🛠️ Architecture & Tech Stack

1. **Frontend UI**: Built with React, TypeScript, and styled with **Tailwind CSS**. Designed for both high-density desktops and mobile touch targets.
2. **Real-Time Backend**: Integrated Express server binding to `0.0.0.0:3000` executing the core gameloop logic and running alongside a `ws` WebSocket connection pool for instantaneous sub-50ms message propagation.
3. **Typography**: Paired modern **Inter** (sans-serif) for high-scannability telemetry labels with **JetBrains Mono** for crypto seed hashes and climbing multiplier fields.
4. **Build System**: Configured with automated development, production bundling via `esbuild` for TypeScript server transpilation, and hot-swappable asset optimization.

---

## 🎮 Gameplay Guide

1. **Place Stakes**: During the 6-second **Betting Phase**, configure your bet sizes on Panel A and/or Panel B. Optionally enable **Auto Cashout** and define your target multiplier (e.g., `2.50x`).
2. **Watch the Ascent**: As the jet plane takes off, the multiplier scales up exponentially.
3. **Cash Out**: Click **CASH OUT** on your active panels to secure your profits. If the plane flies away before you cash out, the bet is lost!
4. **Audit Rounds**: Click any colored multiplier pill in the **Recent History** bar to open its parameter logs. Copy the seed data into the **Provably Fair** tab to audit the cryptographic proof independently.
