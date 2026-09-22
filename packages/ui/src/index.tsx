import type { ReactNode } from 'react';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 11 }}>
      <div aria-hidden style={{ position:'relative', width: compact ? 36 : 46, height: compact ? 36 : 46, borderRadius: compact ? 11 : 14, background: 'linear-gradient(145deg,#06192c 0%,#083d59 52%,#05794d 100%)', display: 'grid', placeItems: 'center', color: 'white', fontWeight: 950, letterSpacing: '-1.5px', boxShadow:'0 8px 24px rgba(4,23,39,.18)', overflow:'hidden' }}>
        <span style={{ position:'relative', zIndex:2, fontSize: compact ? 14 : 17 }}>IPS</span>
        <i style={{position:'absolute',left:0,bottom:0,width:'100%',height:3,background:'linear-gradient(90deg,#168b4f 0 33%,#f5f5f5 33% 66%,#d63b3b 66%)'}}/>
      </div>
      {!compact && <div><strong style={{ display: 'block', letterSpacing: '-0.035em', fontSize:16, lineHeight:1.1 }}>Italy Point System</strong><span style={{ display:'block', marginTop:4, fontSize: 9, opacity: .58, letterSpacing: '.2em', textTransform: 'uppercase', fontWeight:800 }}>Softball Cricket · Italy</span></div>}
    </div>
  );
}

export function Pill({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'blue' | 'amber' | 'red' | 'slate' }) {
  const bg = { green: '#e2f7ec', blue: '#e7f0ff', amber: '#fff1cf', red: '#ffe4e6', slate: '#eaf0f4' }[tone];
  const fg = { green: '#067246', blue: '#164d9e', amber: '#855800', red: '#aa2731', slate: '#314357' }[tone];
  return <span style={{ background: bg, color: fg, borderRadius: 999, padding: '6px 10px', fontWeight: 900, fontSize: 10, whiteSpace: 'nowrap', letterSpacing:'.04em', textTransform:'uppercase' }}>{children}</span>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`ips-panel ${className}`}>{children}</section>;
}
