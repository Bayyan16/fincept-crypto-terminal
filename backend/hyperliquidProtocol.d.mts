export function keccak256Hex(input: string | Uint8Array): string;
export function encodeMsgPack(value: unknown): Uint8Array;
export function formatHlWireNumber(num: number, maxDecimals?: number): string;
export function computeHyperliquidActionHash(
  action: Record<string, unknown>,
  nonce: number,
  vaultAddress?: string | null
): string;
export function buildHyperliquidOrderAction(params: {
  assetIndex: number;
  side: 'LONG' | 'SHORT';
  orderPurpose?: 'ENTRY_MAKER' | 'SCRATCH_EXIT' | 'BREAKEVEN_STOP';
  price: number;
  stopPrice?: number;
  sizeUsd: number;
  quantity?: number;
  szDecimals?: number;
  makerOnly?: boolean;
}): Record<string, unknown>;
export function buildHyperliquidLeverageAction(params: {
  assetIndex: number;
  leverage: number;
  isCross?: boolean;
}): Record<string, unknown>;
export function buildHyperliquidCancelAction(params: {
  assetIndex: number;
  orderId: number | string;
}): Record<string, unknown>;
export function hashHyperliquidTypedData(
  action: Record<string, unknown>,
  nonce: number,
  useTestnet?: boolean,
  vaultAddress?: string | null
): { digest: string; connectionId: string };
export function buildHyperliquidEip712TypedData(
  action: Record<string, unknown>,
  nonce: number,
  useTestnet?: boolean,
  vaultAddress?: string | null
): Record<string, unknown>;
