# IPS Replay Bridge

Local replay engine for IPS + PRISM Live Studio.

The Railway dashboard is only the operator UI. This bridge runs on the production computer, owns the rolling camera buffers, cuts replay clips with FFmpeg, and serves the local **IPS PROGRAM** output that PRISM captures.

## Requirements

- Node.js 20+
- FFmpeg available on PATH
- Camera feeds accessible to the production computer (RTSP/SRT/RTMP or an FFmpeg-supported local capture input)

## Setup

1. Copy `replay.config.example.json` to `replay.config.json`.
2. Configure camera inputs.
3. Run `npm install` inside this folder.
4. Run `npm start`.
5. Open `http://127.0.0.1:8787/program` and add that local output to PRISM as the replay/program source.
6. Open the Railway IPS replay dashboard for the match. It will connect to `127.0.0.1:8787`.

Optional environment variables:

- `IPS_REPLAY_BRIDGE_TOKEN` — bearer token used by the Railway dashboard.
- `IPS_REPLAY_CONFIG` — absolute path to the config JSON.
- `FFMPEG_PATH` — custom FFmpeg executable path.

## Camera input examples

RTSP:

```json
{"id":"cam1","name":"Main","input":"rtsp://192.168.1.50:8554/live"}
```

Windows DirectShow capture:

```json
{"id":"cam1","name":"USB Capture","inputFormat":"dshow","input":"video=USB Video","inputArgs":["-rtbufsize","256M"]}
```

SRT:

```json
{"id":"cam1","name":"Main","input":"srt://0.0.0.0:9001?mode=listener"}
```

The first implementation records video-only H.264 rolling HLS buffers. Program audio should remain managed in PRISM until IPS audio-follow-video is added.
