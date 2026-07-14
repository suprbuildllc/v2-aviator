export type GameStatus = 'betting' | 'running' | 'crashed';

export interface Bet {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  autoCashout?: number;
  cashedOut: boolean;
  cashoutMultiplier?: number;
  payout?: number;
  isSimulated?: boolean;
}

export interface RoundHistoryEntry {
  roundId: string;
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  timestamp: number;
}

export interface GameState {
  status: GameStatus;
  multiplier: number;
  timeLeft: number; // for betting phase countdown in seconds
  currentRoundId: string;
  serverSeedHash: string;
  activeBets: Bet[];
  simulatedBetCount: number;
}

export interface ServerMessage {
  type: 'init' | 'betting_start' | 'round_start' | 'tick' | 'crash' | 'bet_placed' | 'cash_out_success' | 'balance_update' | 'chat_message';
  payload: any;
}
