import raw from "../data/fork-run.json";

export type LendingEventKind =
  | "initialize"
  | "deposit"
  | "borrow"
  | "accrue"
  | "repay"
  | "redeem";

export type LendingEvent = {
  seq: number;
  kind: LendingEventKind;
  actor: string;
  message: string;
  signature: string;
  slot: number;
  blockTime: number | null;
  exchangeRate: number;
  equityAmount?: number;
  receiptAmount?: number;
  collateralAmount?: number;
};

export type ReplayMeta = {
  recordedAt: string;
  cluster: string;
  programId: string;
  market: string;
  equityMint: string;
  receiptSymbol: string;
  collateralMint: string;
  caveats: string[];
};

export type LendingSource = {
  readonly recorded: boolean;
  meta(): ReplayMeta;
  events(): LendingEvent[];
};

export const recordedSource: LendingSource = {
  recorded: true,
  meta: () => raw.meta as ReplayMeta,
  events: () => raw.events as LendingEvent[],
};
