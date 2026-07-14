import { pgTable, serial, text, integer, boolean, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  balance: doublePrecision('balance').default(1000.0).notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rounds = pgTable('rounds', {
  id: integer('id').primaryKey(), // We use the game round ID (e.g. 10001)
  crashPoint: doublePrecision('crash_point').notNull(),
  serverSeed: text('server_seed').notNull(),
  serverSeedHash: text('server_seed_hash').notNull(),
  clientSeed: text('client_seed').notNull(),
  nonce: integer('nonce').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  crashedAt: timestamp('crashed_at'),
});

export const bets = pgTable('bets', {
  id: text('id').primaryKey(), // Can be text uuid or custom format like real-usr-timestamp
  roundId: integer('round_id').references(() => rounds.id).notNull(),
  userId: integer('user_id').references(() => users.id), // Nullable for bots
  playerName: text('player_name').notNull(),
  amount: doublePrecision('amount').notNull(),
  autoCashout: doublePrecision('auto_cashout'),
  cashedOut: boolean('cashed_out').default(false).notNull(),
  cashoutMultiplier: doublePrecision('cashout_multiplier'),
  payout: doublePrecision('payout'),
  isBot: boolean('is_bot').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  bets: many(bets),
}));

export const roundsRelations = relations(rounds, ({ many }) => ({
  bets: many(bets),
}));

export const betsRelations = relations(bets, ({ one }) => ({
  user: one(users, {
    fields: [bets.userId],
    references: [users.id],
  }),
  round: one(rounds, {
    fields: [bets.roundId],
    references: [rounds.id],
  }),
}));
