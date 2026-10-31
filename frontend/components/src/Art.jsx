// Simple measurement illustrations (SVG, no external images needed)
const P = "#ff2e9a", B = "#3b82f6";
const Label = ({ x, y, t, c = P, s = 13 }) => <text x={x} y={y} fill={c} fontSize={s} fontWeight="600" textAnchor="middle">{t}</text>;

export const Room = () => (
  <svg viewBox="0 0 420 310" className="w-full">
    <polygon points="30,20 390,20 290,70 130,70" fill="#1e3a8a" opacity=".35" stroke={B} />
    <polygon points="30,20 130,70 130,170 30,280" fill="#1e40af" opacity=".45" stroke={B} />
    <polygon points="390,20 290,70 290,170 390,280" fill="#1e40af" opacity=".3" stroke={B} />
    <rect x="130" y="70" width="160" height="100" fill="#0b1030" stroke={B} />
    <polygon points="30,280 390,280 290,170 130,170" fill={P} opacity=".22" stroke={P} strokeWidth="2" strokeDasharray="6 4" />
    <rect x="198" y="215" width="26" height="18" fill="#fff" stroke={B} strokeWidth="2" transform="skewX(-12)" />
    <Label x={210} y={256} t="11.8 m²" s={18} />
    <g stroke={P} strokeWidth="2" fill="none" className="draw">
      <path d="M130 188 H290 M130 182 V194 M290 182 V194" />
      <path d="M404 70 V280 M398 70 H410 M398 280 H410" />
    </g>
    <Label x={210} y={206} t="4.2 m" />
    <Label x={406} y={176} t="2.8 m" s={11} />
  </svg>
);

const Wall = ({ children }) => (
  <svg viewBox="0 0 200 140" className="w-full">
    <rect x="4" y="4" width="192" height="132" rx="8" fill="#0b1030" stroke={B} />
    {children}
  </svg>
);
export const WallA4 = () => (
  <Wall>
    <rect x="70" y="30" width="60" height="85" fill="#f4f4f5" />
    <rect x="70" y="30" width="60" height="85" fill="none" stroke={B} strokeWidth="3" />
    {[[70, 30], [130, 30], [130, 115], [70, 115]].map(([x, y]) => <circle key={x + y} cx={x} cy={y} r="5" fill={P} />)}
    <Label x={100} y={78} t="A4" c="#0b1030" s={16} />
  </Wall>
);
export const WallClick = () => (
  <Wall>
    <rect x="20" y="20" width="160" height="100" fill={P} opacity=".25" stroke={P} strokeWidth="2" strokeDasharray="5 3" />
    <rect x="35" y="35" width="26" height="36" fill="#f4f4f5" />
    <path d="M110 70 l0 30 l8 -7 l6 13 l6 -3 l-6 -13 l11 -1z" fill="#fff" stroke={B} />
  </Wall>
);
export const Result = () => (
  <Wall>
    <Label x={100} y={72} t="11.8 m²" s={30} />
    <Label x={100} y={100} t="4.2 m × 2.8 m" c="#93c5fd" s={13} />
    <path d="M40 112 H160 M40 106 V118 M160 106 V118" stroke={P} strokeWidth="2" />
  </Wall>
);
