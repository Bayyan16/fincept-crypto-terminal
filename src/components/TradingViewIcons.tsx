import React from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

const baseProps = (size = 16, className = '') => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
});

/** 1. Crosshair (4-segment TradingView crosshair) */
export const IconCrosshair: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <line x1="12" y1="3" x2="12" y2="9" />
    <line x1="12" y1="15" x2="12" y2="21" />
    <line x1="3" y1="12" x2="9" y2="12" />
    <line x1="15" y1="12" x2="21" y2="12" />
  </svg>
);

/** 2. Trend Line (diagonal segment with 2 hollow endpoint circles) */
export const IconTrendline: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="5" r="2" />
  </svg>
);

/** 2b. Ray */
export const IconRay: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <line x1="6.5" y1="17.5" x2="20" y2="4" />
    <circle cx="5" cy="19" r="2" />
    <circle cx="13" cy="11" r="1.6" />
  </svg>
);

/** 2c. Horizontal Line */
export const IconHLine: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <line x1="3" y1="12" x2="10" y2="12" />
    <line x1="14" y1="12" x2="21" y2="12" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

/** 2d. Vertical Line */
export const IconVLine: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <line x1="12" y1="3" x2="12" y2="10" />
    <line x1="12" y1="14" x2="12" y2="21" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

/** 3. Fib Retracement (4 horizontal lines with 2 anchor circles) */
export const IconFibRetracement: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <line x1="4" y1="6" x2="16" y2="6" />
    <circle cx="18" cy="6" r="1.8" />
    <line x1="4" y1="10.5" x2="20" y2="10.5" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <circle cx="6" cy="19" r="1.8" />
    <line x1="8" y1="19" x2="20" y2="19" />
  </svg>
);

/** 4. XABCD Harmonic Pattern (exact butterfly geometry with vertex circles) */
export const IconXabcdPattern: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <polyline points="5,18 9,7 13,13 18,6 19,17" />
    <line x1="5" y1="18" x2="13" y2="13" strokeDasharray="2 2" strokeWidth="1.1" />
    <line x1="13" y1="13" x2="19" y2="17" strokeDasharray="2 2" strokeWidth="1.1" />
    <circle cx="5" cy="18" r="1.7" fill="#131823" />
    <circle cx="9" cy="7" r="1.7" fill="#131823" />
    <circle cx="13" cy="13" r="1.7" fill="#131823" />
    <circle cx="18" cy="6" r="1.7" fill="#131823" />
    <circle cx="19" cy="17" r="1.7" fill="#131823" />
  </svg>
);

/** 5. Long / Short Risk-Reward Position Tool (L between two horizontal bars with anchor nodes) */
export const IconLongShortPos: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <circle cx="5" cy="6" r="1.7" />
    <line x1="7" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" strokeDasharray="2 2" />
    <circle cx="5" cy="18" r="1.7" />
    <line x1="7" y1="18" x2="20" y2="18" />
    <path d="M10.5 8.5v5.5h3.5" strokeWidth="1.7" />
  </svg>
);

/** 6. Brush / Freehand Sketch (TradingView paintbrush) */
export const IconBrush: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M18.5 4.5c1.1 1.1 1.1 2.9 0 4l-7.2 7.2c-.6.6-1.4 1-2.3 1.1l-3.5.5.5-3.5c.1-.9.5-1.7 1.1-2.3l7.4-7c1.1-1.1 2.9-1.1 4 0z" />
    <path d="M9 15c-1.8.2-3.5 1.4-4 3.5 2.4.3 4.6-.4 5.5-2" />
  </svg>
);

/** 7. Text Annotation (Classic TradingView Serif T) */
export const IconText: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M5 6V4.5h14V6" />
    <line x1="12" y1="4.5" x2="12" y2="19.5" />
    <line x1="9" y1="19.5" x2="15" y2="19.5" />
  </svg>
);

/** 8. Measure Ruler (angled ruler with tick marks) */
export const IconMeasureRuler: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M16.5 3.5l4 4L7.5 20.5l-4-4L16.5 3.5z" />
    <line x1="13.5" y1="6.5" x2="15.5" y2="8.5" />
    <line x1="10.5" y1="9.5" x2="12.5" y2="11.5" />
    <line x1="7.5" y1="12.5" x2="9.5" y2="14.5" />
  </svg>
);

/** 9. Zoom In (magnifying glass +) */
export const IconZoomIn: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <line x1="15.5" y1="15.5" x2="20.5" y2="20.5" />
    <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" />
    <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
  </svg>
);

/** 10. Magnet Snap Mode (horseshoe magnet) */
export const IconMagnet: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M6 19v-8a6 6 0 0 1 12 0v8" />
    <path d="M9.5 19v-8a2.5 2.5 0 0 1 5 0v8" />
    <line x1="6" y1="15.5" x2="9.5" y2="15.5" />
    <line x1="14.5" y1="15.5" x2="18" y2="15.5" />
    <line x1="6" y1="19" x2="9.5" y2="19" />
    <line x1="14.5" y1="19" x2="18" y2="19" />
  </svg>
);

/** 11. Stay in Drawing Mode (pencil + small lock) */
export const IconStayDrawing: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M4 17l1.5-4.5L15 3l3 3-9.5 9.5L4 17z" />
    <rect x="14" y="15" width="6" height="5" rx="1" />
    <path d="M15.5 15v-1.5a1.5 1.5 0 0 1 3 0V15" />
  </svg>
);

/** 12. Lock / Unlock Drawings */
export const IconLock: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <rect x="5" y="11" width="14" height="9" rx="1.8" />
    <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
  </svg>
);

export const IconUnlock: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <rect x="5" y="11" width="14" height="9" rx="1.8" />
    <path d="M8 11V7.5a4 4 0 0 1 7.6-1.7" />
  </svg>
);

/** 13. Hide / Show Drawings (Eye) */
export const IconEye: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

export const IconEyeOff: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-3.3 4" />
    <path d="M6.3 6.3C3.9 8 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.3 4.1-.9" />
  </svg>
);

/** 14. Remove Drawings (Trash Can) */
export const IconTrash: React.FC<IconProps> = ({ size = 16, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M4 7h16" />
    <path d="M9 7V4.5h6V7" />
    <path d="M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

/** Chart Style Icons (Candles, Hollow Candles, Line/Area) */
export const IconCandles: React.FC<IconProps> = ({ size = 15, className }) => (
  <svg {...baseProps(size, className)}>
    <line x1="7" y1="4" x2="7" y2="7" />
    <rect x="5" y="7" width="4" height="8" rx="0.5" fill="currentColor" />
    <line x1="7" y1="15" x2="7" y2="20" />
    <line x1="17" y1="5" x2="17" y2="9" />
    <rect x="15" y="9" width="4" height="7" rx="0.5" />
    <line x1="17" y1="16" x2="17" y2="20" />
  </svg>
);

export const IconHollowCandles: React.FC<IconProps> = ({ size = 15, className }) => (
  <svg {...baseProps(size, className)}>
    <line x1="7" y1="4" x2="7" y2="7" />
    <rect x="5" y="7" width="4" height="9" rx="0.5" />
    <line x1="7" y1="16" x2="7" y2="20" />
    <line x1="17" y1="4" x2="17" y2="8" />
    <rect x="15" y="8" width="4" height="8" rx="0.5" />
    <line x1="17" y1="16" x2="17" y2="20" />
  </svg>
);

export const IconAreaLine: React.FC<IconProps> = ({ size = 15, className }) => (
  <svg {...baseProps(size, className)}>
    <polyline points="3,16 8,11 13,13.5 21,6" />
    <line x1="3" y1="19.5" x2="21" y2="19.5" strokeOpacity="0.45" />
  </svg>
);

export const IconExpand: React.FC<IconProps> = ({ size = 14, className }) => (
  <svg {...baseProps(size, className)}>
    <polyline points="15,3 21,3 21,9" />
    <polyline points="9,21 3,21 3,15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

export const IconCollapse: React.FC<IconProps> = ({ size = 14, className }) => (
  <svg {...baseProps(size, className)}>
    <polyline points="4,14 10,14 10,20" />
    <polyline points="20,10 14,10 14,4" />
    <line x1="14" y1="10" x2="21" y2="3" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

export const IconChevronDown: React.FC<IconProps> = ({ size = 12, className }) => (
  <svg {...baseProps(size, className)}>
    <polyline points="6,9 12,15 18,9" />
  </svg>
);
