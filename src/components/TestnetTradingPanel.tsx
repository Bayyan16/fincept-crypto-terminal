import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

type Product = 'SPOT' | 'PERP';
type CloseTrigger = 'TAKE_PROFIT' | 'STOP_LOSS';
type Protection = { takeProfitPct: number; stopLossPct: number };
interface AutomationRule {
  product: Product;
  symbol: string;
  enabled: boolean;
  budget: number;
  protection: Protection;
  error?: string;
  lastIntelSummary?: string;
}
type Intent = {
  id: string;
  product: Product;
  symbol: string;
} & ({ action: 'OPEN'; side: 'BUY' | 'SELL'; budget: number; protection: Protection } | { action: 'CLOSE' });
interface JournalOrder {
  id: string;
  product: Product;
  symbol: string;
  action: 'OPEN' | 'CLOSE';
  side: 'BUY' | 'SELL';
  quantity: string;
  executed: number;
  status: string;
  venueId?: string;
  fillsPending: boolean;
  syncError?: string;
  source?: 'AUTOMATION';
  trigger?: CloseTrigger;
}
interface Journal {
  configured: Product[];
  origins?: Record<string, string>;
  futuresLeverage?: number;
  symbols: string[];
  orders: JournalOrder[];
  automation?: AutomationRule[];
  positions: { product: Product; symbol: string; quantity: number; entryPrice?: number;
    exchangeStopId?: string | null;
    protection?: { takeProfit: number; stopLoss: number }; trigger?: CloseTrigger; protectionStatus?: string }[];
  maxOrder: number;
  dailyLimit: number;
  realizedToday: number | null;
  halted: boolean;
  riskHalted: boolean;
}

const base = '/api/trading/testnet';
const control = 'border border-[#314257] bg-[#111d2b] px-3 py-2 text-sm disabled:opacity-50';
const idForOrder = () => `ft-${crypto.randomUUID().replaceAll('-', '')}`;
const triggerName = (trigger: CloseTrigger) => trigger === 'STOP_LOSS' ? 'Stop-loss' : 'Take-profit';
const formatPrice = new Intl.NumberFormat('id-ID', { maximumSignificantDigits: 8 });
const productName = (product: Product) => product === 'SPOT' ? 'Spot' : 'Futures';

class TradingRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(token: string, path = '', body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new TradingRequestError(data.error || 'Permintaan gagal.', response.status);
  return data;
}

export function TestnetTradingPanel({ onBack }: { onBack: () => void }) {
  const [draftToken, setDraftToken] = useState('');
  const [token, setToken] = useState('');
  const [journal, setJournal] = useState<Journal | null>(null);
  const [product, setProduct] = useState<Product>('SPOT');
  const [symbol, setSymbol] = useState('');
  const [budget, setBudget] = useState('50');
  const [takeProfitPct, setTakeProfitPct] = useState('2');
  const [stopLossPct, setStopLossPct] = useState('1');
  const [message, setMessage] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Intent | null>(null);
  const operation = useRef(false);
  const readVersion = useRef(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const version = ++readVersion.current;
    try {
      const data = await request<Journal>(token, '', undefined, signal);
      if (version !== readVersion.current || signal?.aborted) return;
      setJournal(data);
      setConnectionError('');
      setSymbol((selected) => data.symbols.includes(selected) ? selected : data.symbols[0] ?? '');
    } catch (error) {
      if (version !== readVersion.current || signal?.aborted) return;
      setConnectionError(error instanceof Error ? error.message : 'Jurnal tidak dapat dibaca.');
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const refreshNow = () => { void refresh(controller.signal); };
    refreshNow();
    const timer = window.setInterval(refreshNow, 3000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [token, refresh]);

  function connect(event: FormEvent) {
    event.preventDefault();
    setJournal(null);
    setConnectionError('');
    if (draftToken.trim() === token) void refresh();
    else setToken(draftToken.trim());
    setDraftToken('');
  }

  async function mutate(path: string, body: object, intent?: Intent) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage('');
    if (intent) setPending(intent);
    try {
      const result = await request<{ order?: JournalOrder }>(token, path, body);
      if (intent) setPending(null);
      if (result.order) setMessage(`${result.order.symbol} · ${result.order.status}`);
      else if (path === '/automation') setMessage('Pengaturan otomasi tersimpan di server.');
      else if (path === '/resume') setMessage('Entry Testnet diaktifkan kembali.');
      else setMessage('Entry dihentikan. Pembatalan order aktif diproses oleh server.');
    } catch (error) {
      if (intent && error instanceof TradingRequestError && [400, 409, 415, 422, 423].includes(error.status)) setPending(null);
      setMessage(error instanceof Error ? error.message : 'Permintaan belum terkonfirmasi.');
    } finally {
      await refresh();
      operation.current = false;
      setBusy(false);
    }
  }

  const protection = { takeProfitPct: Number(takeProfitPct), stopLossPct: Number(stopLossPct) };
  const validProtection = Object.values(protection).every((pct) => Number.isFinite(pct) && pct >= 0.1 && pct <= 25);

  function entry(side: 'BUY' | 'SELL') {
    const intent: Intent = { id: idForOrder(), product, symbol, budget: Number(budget), action: 'OPEN', side, protection };
    void mutate('/orders', intent, intent);
  }

  const selectedRule = journal?.automation?.find((rule) => rule.product === product && rule.symbol === symbol);
  const canEnter = journal && journal.configured.includes(product) && !journal.halted && !journal.riskHalted &&
    !connectionError && !busy && !pending && symbol && validProtection && Number(budget) > 0 && Number(budget) <= journal.maxOrder;
  const displayOrders = journal?.orders.filter((order) => order.product === product) ?? [];

  return (
    <main className="min-h-screen bg-[#060a10] text-white p-4 sm:p-8" data-testid="testnet-trading">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[#00e5ff]">Binance Testnet</h1>
          <button className={control} onClick={onBack}>Kembali ke terminal</button>
        </div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={connect}>
          <label className="grid gap-1 text-sm">Token trading server
            <input className={control} type="password" autoComplete="off" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} required />
          </label>
          <button className={control} disabled={busy}>Buka jurnal</button>
        </form>
        {connectionError && <p role="alert" className="text-[#ff8c96]">{connectionError}</p>}
        {journal && (
          <>
            <div className="flex flex-wrap items-center gap-3 border-y border-[#26354d] py-3">
              <span>PnL tercatat hari ini (UTC) {journal.realizedToday === null ? 'belum lengkap' : `${journal.realizedToday.toFixed(2)} USDT`}</span>
              <span>Batas rugi {journal.dailyLimit} USDT</span>
              {journal.futuresLeverage && <span>Leverage Futures {journal.futuresLeverage}x</span>}
              {journal.origins?.[product] && <span className="text-xs text-[#94a3b8]">Host: {journal.origins[product]}</span>}
              <button className={control} disabled={busy || journal.halted} onClick={() => void mutate('/halt', {})}>
                {journal.halted ? 'Entry dihentikan' : 'Hentikan entry & batalkan order entry'}
              </button>
              {journal.halted && <button className={control} disabled={busy || journal.riskHalted} onClick={() => void mutate('/resume', {})}>Aktifkan entry kembali</button>}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-sm">Pasar
                <select className={control} value={product} onChange={(event) => setProduct(event.target.value as Product)}>
                  <option value="SPOT">Spot</option><option value="PERP">Futures USDT-M</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">Instrumen
                <select className={control} value={symbol} onChange={(event) => setSymbol(event.target.value)}>
                  {journal.symbols.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">Nilai order (USDT)
                <input type="number" className={control} min="0" max={journal.maxOrder} step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">Take-profit (%)
                <input type="number" className={control} min="0.1" max="25" step="0.1" value={takeProfitPct} onChange={(event) => setTakeProfitPct(event.target.value)} />
              </label>
              <label className="grid gap-1 text-sm">Stop-loss (%)
                <input type="number" className={control} min="0.1" max="25" step="0.1" value={stopLossPct} onChange={(event) => setStopLossPct(event.target.value)} />
              </label>
              <button className={control} disabled={!canEnter} onClick={() => entry('BUY')}>
                {product === 'SPOT' ? 'Beli Spot' : 'Buka Long'}
              </button>
              {product === 'PERP' && <button className={control} disabled={!canEnter} onClick={() => entry('SELL')}>Buka Short</button>}
            </div>
            <div className="space-y-2 border border-[#26354d] p-3">
              <div className="flex flex-wrap items-center gap-3">
                <strong>Auto-entry Closed-Candle + On-Chain / L2 / News Confluence</strong>
                {selectedRule?.enabled ? (
                  <button className={control} disabled={busy || !!connectionError} onClick={() => void mutate('/automation', { product, symbol, enabled: false })}>Jeda auto-entry</button>
                ) : (
                  <button className={control} disabled={!canEnter} onClick={() => void mutate('/automation', {
                    product, symbol, enabled: true, budget: Number(budget), protection,
                  })}>Aktifkan auto-entry</button>
                )}
              </div>
              {selectedRule?.enabled && <p className="text-sm">Aktif untuk {selectedRule.symbol} · {selectedRule.budget} USDT · TP {selectedRule.protection.takeProfitPct}% · SL {selectedRule.protection.stopLossPct}%</p>}
              {selectedRule?.lastIntelSummary && <p className="text-xs text-[#00e5ff]">Konfluensi Real-Time: {selectedRule.lastIntelSummary}</p>}
              {selectedRule?.error && <p role="alert" className="text-sm text-[#ff8c96]">{selectedRule.error}</p>}
              <p className="text-sm text-[#94a3b8]">Proteksi ganda: Exchange Stop-Loss (STOP_MARKET / STOP_LOSS_LIMIT) otomatis dipasang di bursa + monitor TP/SL server. Cancel-before-close aktif otomatis.</p>
            </div>
            {!journal.configured.includes(product) && <p>Kredensial {productName(product)} belum tersedia di server.</p>}
            {journal.riskHalted && !journal.halted && <p>Kontrol risiko sedang menahan entry.</p>}
            {journal.positions.filter((position) => position.product === product).map((position) => (
              <div key={position.symbol} className="flex flex-wrap items-center gap-3">
                <span>Posisi terkonfirmasi {position.symbol} · {position.quantity}</span>
                {position.protection && <span>TP {formatPrice.format(position.protection.takeProfit)} · SL {formatPrice.format(position.protection.stopLoss)}</span>}
                {position.exchangeStopId && <span className="text-xs text-[#00e676]">✓ Exchange SL Armed</span>}
                {position.trigger && <span>{triggerName(position.trigger)} terpicu</span>}
                {position.protectionStatus && <span className="text-[#ff8c96]">{position.protectionStatus}</span>}
                <button className={control} disabled={busy || !!pending || !!connectionError} onClick={() => {
                  const intent: Intent = { id: idForOrder(), action: 'CLOSE', product, symbol: position.symbol };
                  void mutate('/orders', intent, intent);
                }}>{position.product === 'SPOT' ? 'Jual Spot' : 'Tutup posisi Futures'}</button>
              </div>
            ))}
            <h2 className="font-semibold">Jurnal {productName(product)}</h2>
            <ul className="space-y-1">
              {displayOrders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center gap-3 border border-[#26354d] p-2 text-sm">
                  <span>{order.symbol} · {order.side} · {order.status} · terisi {order.executed}/{order.quantity}</span>
                  {order.source === 'AUTOMATION' && <span>{order.trigger ? triggerName(order.trigger) : 'Auto-entry'}</span>}
                  {order.fillsPending && <span>Fill menunggu rekonsiliasi</span>}
                  {order.syncError && <span>{order.syncError}</span>}
                  {order.action === 'OPEN' && order.venueId && ['NEW', 'PARTIALLY_FILLED', 'PENDING_CANCEL'].includes(order.status) && (
                    <button className={control} disabled={busy || !!connectionError} onClick={() => void mutate('/cancel', { id: order.id })}>Batalkan order</button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        {message && <p role="status">{message}</p>}
        {pending && <button className={control} disabled={busy} onClick={() => void mutate('/orders', pending, pending)}>Periksa ulang permintaan yang sama</button>}
      </div>
    </main>
  );
}
