'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type ReplayEvent = { id: string; kind: string; ball: string; at: number };
type BridgeStatus = { connected: boolean; program: 'LIVE' | 'REPLAY'; cameras: string[]; recording: boolean };
const defaultStatus: BridgeStatus = { connected: false, program: 'LIVE', cameras: [], recording: false };
const bridge = process.env.NEXT_PUBLIC_IPS_REPLAY_BRIDGE_URL || 'http://127.0.0.1:8787';
const token = process.env.NEXT_PUBLIC_IPS_REPLAY_BRIDGE_TOKEN || '';
async function command(path: string, body?: unknown) {
  const response = await fetch(bridge + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error('Replay engine returned ' + response.status);
  return response.json();
}
export default function ReplayConsole({ params }: { params: Promise<{ matchId: string }> }) {
  const [matchId, setMatchId] = useState('');
  const [status, setStatus] = useState<BridgeStatus>(defaultStatus);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [selected, setSelected] = useState<ReplayEvent | null>(null);
  const [camera, setCamera] = useState('');
  const [speed, setSpeed] = useState(0.5);
  const [before, setBefore] = useState(7);
  const [after, setAfter] = useState(4);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const [scorerStatus, setScorerStatus] = useState<'CONNECTING' | 'LIVE' | 'UNAVAILABLE'>('CONNECTING');
  const video = useRef<HTMLVideoElement>(null);
  const supabase = useMemo(() => createClient(), []);
  useEffect(() => { void params.then(p => setMatchId(p.matchId)); }, [params]);
  useEffect(() => {
    if (!matchId) return;
    const toReplayMarker = (row: any) => {
      if (!row || row.event_type !== 'DELIVERY') return null;
      const kind = row.is_wicket ? 'WICKET' : Number(row.runs_off_bat) === 6 ? 'SIX' : Number(row.runs_off_bat) === 4 ? 'FOUR' : null;
      if (!kind) return null;
      const parsedAt = Date.parse(row.created_at || row.recorded_at || row.occurred_at || '');
      return {
        id: String(row.id),
        kind,
        ball: String(row.delivery_label || (row.sequence_no != null ? '#' + row.sequence_no : kind)),
        at: Number.isFinite(parsedAt) ? parsedAt : Date.now(),
      };
    };
    const pushMarker = async (row: any) => {
      const marker = toReplayMarker(row);
      if (!marker) return;
      try {
        await command('/matches/' + encodeURIComponent(matchId) + '/events', marker);
      } catch {
        // The operator console remains safe when the local bridge is offline.
      }
    };
    const syncRecent = async () => {
      const { data } = await supabase
        .from('match_scoring_events')
        .select('id,event_type,is_wicket,runs_off_bat,delivery_label,sequence_no,created_at')
        .eq('match_id', matchId)
        .eq('event_type', 'DELIVERY')
        .order('sequence_no', { ascending: false })
        .limit(80);
      for (const row of [...(data ?? [])].reverse()) await pushMarker(row);
    };
    void syncRecent();
    const channel = supabase
      .channel('ips-replay-scorer-' + matchId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_scoring_events', filter: 'match_id=eq.' + matchId }, payload => {
        void pushMarker(payload.new);
      })
      .subscribe(state => {
        if (state === 'SUBSCRIBED') setScorerStatus('LIVE');
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') setScorerStatus('UNAVAILABLE');
      });
    return () => { void supabase.removeChannel(channel); };
  }, [matchId, supabase]);

  useEffect(() => {
    if (!matchId) return;
    let active = true;
    const poll = async () => {
      try {
        const [s, e] = await Promise.all([command('/status'), command('/matches/' + encodeURIComponent(matchId) + '/events')]);
        if (!active) return;
        setStatus({ connected: true, program: s.program === 'REPLAY' ? 'REPLAY' : 'LIVE', cameras: Array.isArray(s.cameras) ? s.cameras : [], recording: !!s.recording });
        setEvents(Array.isArray(e.events) ? e.events : []);
        setCamera(c => c || s.cameras?.[0] || '');
      } catch { if (active) setStatus(defaultStatus); }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, [matchId]);
  async function run(path: string, payload: unknown) {
    if (!status.connected || busy) return;
    setBusy(true); setError('');
    try {
      const result = await command(path, payload);
      if (result.previewUrl) setPreview(result.previewUrl);
      if (result.program) setStatus(s => ({ ...s, program: result.program }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Command failed'); }
    finally { setBusy(false); }
  }
  const clip = { matchId, eventId: selected?.id, camera, speed, beforeSeconds: before, afterSeconds: after };
  const button = (label: string, action: () => void, disabled = false, danger = false) =>
    <button disabled={disabled || busy} onClick={action} style={{ padding: '13px 18px', borderRadius: 9, border: '1px solid #35435a', background: danger ? '#b91c1c' : '#243650', color: '#fff', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .45 : 1 }}>{label}</button>;
  return <main style={{ minHeight: '100vh', background: '#0b1220', color: '#eef4ff', fontFamily: 'system-ui,sans-serif', padding: 24 }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 22 }}>
      <div><h1 style={{ margin: 0 }}>IPS REPLAY</h1><small>Match {matchId} · Independent replay workstation</small></div>
      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
        <span style={{ fontSize:11, color: scorerStatus === 'LIVE' ? '#86efac' : '#fbbf24' }}>SCORER {scorerStatus}</span>
        <a href={bridge + '/program'} target="_blank" rel="noreferrer" style={{ padding:'9px 12px', borderRadius:8, border:'1px solid #334155', color:'#e2e8f0', textDecoration:'none', fontSize:11, fontWeight:800 }}>OPEN IPS PROGRAM ↗</a>
        <strong style={{ color: status.program === 'REPLAY' ? '#fb7185' : '#4ade80' }}>● {status.program} {status.connected ? '· ENGINE CONNECTED' : '· ENGINE OFFLINE'}</strong>
      </div>
    </header>
    {!status.connected && <p role="alert" style={{ background: '#4a2715', padding: 15, borderRadius: 8 }}>Local replay engine unavailable. On-air controls are disabled; no broadcast changes will be made. Start and configure the local engine on the production PC.</p>}
    {error && <p role="alert" style={{ color: '#fda4af' }}>{error}</p>}
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
      <div style={{ background: '#152238', borderRadius: 14, padding: 18 }}>
        <h2>Replay preview</h2>
        <video ref={video} src={preview || undefined} controls playsInline style={{ width: '100%', aspectRatio: '16/9', background: '#050910', borderRadius: 8 }} />
        <p>Preview is isolated from the live program output.</p>
        <h3>Cameras</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{status.cameras.length ? status.cameras.map(c => <button key={c} onClick={() => setCamera(c)} aria-pressed={camera === c} style={{ padding: 12, background: camera === c ? '#2563eb' : '#334155', color: 'white', border: 0, borderRadius: 7 }}>{c}</button>) : 'No camera feeds detected'}</div>
        <h3>Clip controls</h3>
        <label>Seconds before event: {before}<input aria-label="Seconds before event" type="range" min="1" max="30" value={before} onChange={e => setBefore(+e.target.value)} style={{ width: '100%' }} /></label>
        <label>Seconds after event: {after}<input aria-label="Seconds after event" type="range" min="1" max="20" value={after} onChange={e => setAfter(+e.target.value)} style={{ width: '100%' }} /></label>
        <p>Playback speed</p><div style={{ display: 'flex', gap: 8 }}>{[1,.75,.5,.25].map(s => <button key={s} onClick={() => setSpeed(s)} aria-pressed={speed === s} style={{ padding: 10, borderRadius: 6, color: 'white', background: speed === s ? '#2563eb' : '#334155', border: 0 }}>{s}×</button>)}</div>
      </div>
      <div style={{ background: '#152238', borderRadius: 14, padding: 18 }}>
        <h2>Event queue</h2>
        <div style={{ maxHeight: 350, overflowY: 'auto' }}>{events.length ? events.map(e => <button key={e.id} onClick={() => setSelected(e)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 14, marginBottom: 7, color: 'white', borderRadius: 7, border: selected?.id === e.id ? '2px solid #60a5fa' : '1px solid #334155', background: '#1e293b' }}>{e.kind} · {e.ball}</button>) : <p>No replay markers yet. Events will appear when the local engine receives scorer timestamps.</p>}</div>
        <p>Selected: {selected ? selected.kind + ' · ' + selected.ball : 'None'}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {button('PREVIEW', () => void run('/replay/preview', clip), !selected || !camera || !status.connected)}
          {button('SAVE CLIP', () => void run('/replay/save', clip), !selected || !camera || !status.connected)}
          {button('TAKE REPLAY', () => void run('/program/replay', clip), !selected || !camera || !status.connected, true)}
          {button('RETURN LIVE', () => void run('/program/live', { matchId }), !status.connected)}
          {button('ABORT → LIVE', () => void run('/program/abort', { matchId }), !status.connected, true)}
        </div>
        <p style={{ fontSize: 13, color: '#a5b4ca' }}>FOUR, SIX and WICKET markers are mirrored from the scorer into the local engine. TAKE REPLAY only reports success after the local engine builds the clip and switches IPS PROGRAM to replay.</p>
      </div>
    </section>
  </main>;
}
