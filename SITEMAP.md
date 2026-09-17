# EchoText Ghana — Site Map

## Frontend Views

### Public / Entry
- `/` — Landing page (view: `landing`)
  - Join session by ID
  - Start demo mode
  - Open agent dashboard

### Transcription Flow
- `/transcription` — Live transcription page (view: `transcription`)
  - Real-time transcript streaming
  - AI-generated insight cards
  - Send SMS notification
  - Complete / end session

### Demo Flow
- `/demo` — Demo page (view: `demo`)
  - Simulated customer-support conversation
  - On completion, navigates to `/completion`

### Agent Flow
- `/agent` — Agent dashboard (view: `agent`)
  - Session-based agent workspace
  - Customer context cards
  - Suggested responses

### Completion
- `/completion` — Completion screen (view: `completion`)
  - Case number display
  - Status badge
  - Return to landing

## Backend API Endpoints

### Health & Info
- `GET /api/health` — Service health check
- `GET /api/languages` — Supported and planned languages

### QR Codes
- `GET /api/qr/{counter_id}` — Generate QR PNG
- `GET /api/qr-base64/{counter_id}` — Generate QR as base64

### SMS
- `POST /api/sms/send` — Send SMS notification for a case

### Sessions
- `GET /api/session/{session_id}` — Retrieve session metadata and cards

### WebSocket
- `WS /ws/{session_id}` — Live transcription stream
  - Client messages: `response`, `pause`, `resume`, `request_sms`

### Demo Data
- `GET /api/demo/conversation` — Return full demo transcript
