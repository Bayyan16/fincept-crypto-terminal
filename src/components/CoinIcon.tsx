import React, { useState } from 'react';

interface CoinIconProps {
  coin: string;
  size?: number;
  className?: string;
}

const COIN_BG: Record<string, { bg: string; fg: string; ring?: string }> = {
  BTC: { bg: '#F7931A', fg: '#FFFFFF' },
  ETH: { bg: '#627EEA', fg: '#FFFFFF' },
  XRP: { bg: '#111827', fg: '#00AAE4', ring: '#00AAE4' },
  BNB: { bg: '#F3BA2F', fg: '#0B0E11' },
  SOL: { bg: '#10141F', fg: '#14F195', ring: '#9945FF' },
  DOGE: { bg: '#C2A633', fg: '#FFFFFF' },
  ADA: { bg: '#0033AD', fg: '#7DD3FC' },
  TRX: { bg: '#FF060A', fg: '#FFFFFF' },
  AVAX: { bg: '#E84142', fg: '#FFFFFF' },
  LINK: { bg: '#2A5ADA', fg: '#FFFFFF' },
  HYPE: { bg: '#0B2326', fg: '#50E3C2', ring: '#50E3C2' },
  SUI: { bg: '#3898EC', fg: '#FFFFFF' },
  JUP: { bg: '#18241C', fg: '#C7F284', ring: '#C7F284' },
  RAY: { bg: '#131A35', fg: '#5AC4BE', ring: '#8C6EEF' },
  ZEC: { bg: '#F4B728', fg: '#111827', ring: '#FDE68A' },
  USDC: { bg: '#2775CA', fg: '#FFFFFF', ring: '#93C5FD' },
  USDT: { bg: '#26A17B', fg: '#FFFFFF', ring: '#6EE7B7' },
  USDG: { bg: '#111827', fg: '#D500F9', ring: '#D500F9' },
  PEPE: { bg: '#15803D', fg: '#DCFCE7', ring: '#4ADE80' },
  BONK: { bg: '#EA580C', fg: '#FEF3C7', ring: '#FACC15' },
  CAKE: { bg: '#3B2314', fg: '#60EFFF', ring: '#F472B6' },
  AAVE: { bg: '#2EBAC6', fg: '#FFFFFF', ring: '#B6509E' },
  UNI: { bg: '#FF007A', fg: '#FFFFFF' },
  ARB: { bg: '#1D2939', fg: '#28A0F0', ring: '#28A0F0' },
  PAXG: { bg: '#CA8A04', fg: '#FEF9C3', ring: '#FACC15' },
};

function normalizeCoinSymbol(coin: string): string {
  const clean = (coin || 'BTC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const strippedK = clean.replace(/^K(?=[A-Z]{2,})/, '');
  if (strippedK === 'WETH') return 'ETH';
  if (strippedK === 'WBTC') return 'BTC';
  if (strippedK === 'WBNB') return 'BNB';
  if (strippedK === 'WSOL') return 'SOL';
  if (strippedK === 'WHYPE') return 'HYPE';
  return strippedK || clean || 'BTC';
}

/**
 * Crisp inline vector icon per cryptocurrency asset (zero external CDN latency).
 */
export const CoinIcon: React.FC<CoinIconProps> = ({ coin, size = 14, className = '' }) => {
  const sym = normalizeCoinSymbol(coin);
  const style = COIN_BG[sym] || { bg: '#1E293B', fg: '#38BDF8', ring: '#38BDF8' };

  const renderGlyph = () => {
    switch (sym) {
      case 'BTC':
        return (
          <path
            d="M10.2 6.8c1.5.2 2.4.9 2.3 2-.1.8-.5 1.3-1.2 1.5.9.3 1.4.9 1.3 1.9-.2 1.4-1.3 2-3.2 2.1v1.4H8.3v-1.4H7.4v1.4H6.3v-1.4H4.8l.3-1.2h.8c.3 0 .4-.1.4-.4V7.3c0-.3-.1-.4-.5-.4H5V5.7h1.3V4.3h1.1v1.4h.9V4.3h1.1v1.4c.3 0 .5.1.8.1zM7.6 7v2.3c.9 0 2.3.1 2.4-1.1.1-1-1.3-1.2-2.4-1.2zm0 3.3v2.6c1.1 0 2.6.1 2.7-1.2.1-1.3-1.4-1.4-2.7-1.4z"
            fill={style.fg}
            transform="translate(1.5, 0.2)"
          />
        );
      case 'ETH':
        return (
          <g fill={style.fg}>
            <polygon points="10,3.2 5.7,10.2 10,12.7 14.3,10.2" opacity="0.95" />
            <polygon points="10,13.6 5.7,11.1 10,16.8 14.3,11.1" opacity="0.8" />
          </g>
        );
      case 'XRP':
        return (
          <path
            d="M5.4 5.2h1.9l2.7 3 2.7-3h1.9l-3.6 4.1v1.4l3.6 4.1h-1.9l-2.7-3-2.7 3H5.4l3.6-4.1V9.3L5.4 5.2z"
            fill={style.fg}
          />
        );
      case 'BNB':
        return (
          <g fill={style.fg}>
            <polygon points="10,4.2 12.1,6.3 10,8.4 7.9,6.3" />
            <polygon points="6.3,7.9 8.4,10 6.3,12.1 4.2,10" />
            <polygon points="13.7,7.9 15.8,10 13.7,12.1 11.6,10" />
            <polygon points="10,11.6 12.1,13.7 10,15.8 7.9,13.7" />
            <polygon points="10,8.6 11.4,10 10,11.4 8.6,10" />
          </g>
        );
      case 'SOL':
        return (
          <g>
            <polygon points="5.5,6.2 14.5,6.2 13.2,7.8 4.2,7.8" fill="#14F195" />
            <polygon points="4.2,9.2 13.2,9.2 14.5,10.8 5.5,10.8" fill="#00C2FF" />
            <polygon points="5.5,12.2 14.5,12.2 13.2,13.8 4.2,13.8" fill="#9945FF" />
          </g>
        );
      case 'DOGE':
        return (
          <path
            d="M6.3 5.5h3.9c2.7 0 4.5 1.8 4.5 4.5s-1.8 4.5-4.5 4.5H6.3V11H5.1V9.6h1.2V5.5zm2 1.6v2.5h2.2V11H8.3v2h1.8c1.6 0 2.6-1.1 2.6-3s-1-2.9-2.6-2.9H8.3z"
            fill={style.fg}
          />
        );
      case 'ADA':
        return (
          <g fill={style.fg}>
            <circle cx="10" cy="10" r="1.4" />
            <circle cx="10" cy="5.5" r="0.95" />
            <circle cx="10" cy="14.5" r="0.95" />
            <circle cx="6.1" cy="7.7" r="0.95" />
            <circle cx="13.9" cy="7.7" r="0.95" />
            <circle cx="6.1" cy="12.3" r="0.95" />
            <circle cx="13.9" cy="12.3" r="0.95" />
          </g>
        );
      case 'TRX':
        return (
          <path
            d="M4.8 5.4l10.6 2.1-4.8 7.9-5.8-10zm2.1 1.6l3.3 5.6 1.5-4.5-4.8-1.1zm5.7 1.3l-1.1 3.7 2.5-3.4-1.4-.3z"
            fill={style.fg}
          />
        );
      case 'AVAX':
        return (
          <g fill={style.fg}>
            <polygon points="10,4.5 5.2,13.8 7.7,13.8 10,9.2 11.4,11.9 12.9,11.9" />
            <polygon points="12.3,10.8 10.6,13.8 14.8,13.8" />
          </g>
        );
      case 'LINK':
        return (
          <path
            d="M10 4.2l4.8 2.8v6L10 15.8 5.2 13V7L10 4.2zm0 2.2L7.1 8.1v3.8L10 13.6l2.9-1.7V8.1L10 6.4z"
            fill={style.fg}
          />
        );
      case 'HYPE':
        return (
          <path
            d="M6.4 10c0-1.6 1.2-2.7 2.6-2.7 1.2 0 1.9.8 2.6 2.1.6 1.1 1.1 1.6 1.9 1.6 1 0 1.7-.8 1.7-1.8 0-1.1-.8-1.9-1.8-1.9-.7 0-1.3.4-1.8 1l-.9-1.2c.8-.9 1.7-1.4 2.8-1.4 1.9 0 3.3 1.5 3.3 3.5s-1.4 3.5-3.3 3.5c-1.4 0-2.3-.8-3.1-2.2-.6-1-.9-1.5-1.5-1.5-.7 0-1.2.6-1.2 1.3 0 .8.6 1.4 1.3 1.4.5 0 1-.3 1.3-.8l1 1.1c-.6.8-1.4 1.3-2.4 1.3-1.7 0-2.9-1.3-2.9-3.1z"
            fill={style.fg}
            transform="translate(-1.3, 0)"
          />
        );
      case 'SUI':
        return (
          <path
            d="M10 4.1c1.8 2.4 3.8 4.9 3.8 7.3a3.8 3.8 0 1 1-7.6 0c0-2.4 2-4.9 3.8-7.3zm-1.4 8.1c.2.9 1 1.5 1.9 1.5.7 0 1.3-.3 1.7-.9-.6.1-1.3-.3-1.8-1-.6-.8-1.4-.6-1.8.4z"
            fill={style.fg}
          />
        );
      case 'JUP':
        return (
          <g>
            <circle cx="10" cy="10" r="4.2" fill="none" stroke="#C7F284" strokeWidth="1.4" />
            <ellipse cx="10" cy="10" rx="6.2" ry="2.1" transform="rotate(-24 10 10)" fill="none" stroke="#22D3EE" strokeWidth="1.4" />
            <circle cx="10" cy="10" r="1.4" fill="#C7F284" />
          </g>
        );
      case 'RAY':
        return (
          <g>
            <polygon points="10,4 15.2,7 15.2,13 10,16 4.8,13 4.8,7" fill="none" stroke="#8C6EEF" strokeWidth="1.4" />
            <path d="M7.6 7.4h3c1.1 0 1.8.6 1.8 1.5 0 .7-.4 1.2-1.1 1.4l1.3 2.3h-1.6l-1.1-2H9v2H7.6V7.4zm1.4 1.1v1.4h1.4c.5 0 .8-.3.8-.7s-.3-.7-.8-.7H9z" fill="#5AC4BE" />
          </g>
        );
      case 'ZEC':
        return (
          <path
            d="M9.3 4.2h1.4v1.4h2.9v1.5l-4.5 5.8h4.5v1.5h-2.9v1.4H9.3v-1.4H6.4v-1.5l4.5-5.8H6.4V5.6h2.9V4.2z"
            fill={style.fg}
          />
        );
      case 'USDC':
      case 'USDT':
      case 'USDG':
        return (
          <path
            d="M9.4 4.3h1.2v1.2c1.4.2 2.4 1 2.4 2.1h-1.5c0-.6-.5-1-1.5-1-.9 0-1.4.4-1.4.9 0 .6.5.9 1.7 1.1 1.8.4 2.8 1 2.8 2.4 0 1.2-1 2.1-2.5 2.3v1.4H9.4v-1.4c-1.5-.2-2.6-1.1-2.7-2.4h1.5c.1.7.7 1.1 1.7 1.1 1 0 1.6-.4 1.6-1 0-.6-.5-.9-1.8-1.2-1.7-.4-2.7-1-2.7-2.3 0-1.2 1-2 2.4-2.2V4.3z"
            fill={style.fg}
          />
        );
      default:
        return (
          <text
            x="10"
            y="12.8"
            textAnchor="middle"
            fontSize={sym.length >= 4 ? '6.6' : '8.2'}
            fontWeight="800"
            fill={style.fg}
            fontFamily="monospace"
          >
            {sym.slice(0, 3)}
          </text>
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={`shrink-0 inline-block ${className}`}
      aria-label={`${sym} icon`}
    >
      <circle
        cx="10"
        cy="10"
        r="9.2"
        fill={style.bg}
        stroke={style.ring || 'rgba(255,255,255,0.16)'}
        strokeWidth="1.1"
      />
      {renderGlyph()}
    </svg>
  );
};

interface MarketTokenIconProps {
  symbol: string;
  chainId?: string;
  address?: string;
  imageUrl?: string;
  size?: number;
  className?: string;
}

/**
 * Full-coverage market & DEX token icon:
 * Renders real off-chain/on-chain logo via backend `/api/live/token-icon` (never 404),
 * with instant vector <CoinIcon /> while loading or on offline fallback.
 */
export const MarketTokenIcon: React.FC<MarketTokenIconProps> = ({
  symbol,
  chainId = 'hyperliquid',
  address = '',
  imageUrl,
  size = 16,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const src =
    imageUrl ||
    `/api/live/token-icon?symbol=${encodeURIComponent(symbol || 'TOK')}&chain=${encodeURIComponent(
      chainId
    )}${address ? `&addr=${encodeURIComponent(address)}` : ''}`;

  if (failed || !src) {
    return <CoinIcon coin={symbol} size={size} className={className} />;
  }

  return (
    <img
      src={src}
      alt={`${symbol} icon`}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`rounded-full shrink-0 object-cover bg-[#0B1220] border border-white/10 ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

