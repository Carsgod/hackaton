# EchoText Ghana
Turning Spoken Support into Accessible Text

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- npm or yarn

### Backend Setup

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # Mac/Linux
pip install -r requirements.txt
python main.py
```

The backend will start at `http://localhost:8000`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start at `http://localhost:3000`

## 🎯 Features

### MVP Demo Journey
A Deaf customer visits an MTN service center to resolve a failed MoMo transaction. She scans the desk QR code, reads the agent's spoken explanation live on her screen, responds using quick-choice prompts or typing, approves the refund details, and leaves with a saved transcript and an SMS confirmation ticket containing her case number. She resolves her issue independently, without an interpreter, in under five minutes.

### Core Features
- **Live Transcription** - Real-time speech-to-text with <1.5s latency
- **Pinned Cards** - Reference numbers, amounts, and actions highlighted visually
- **Quick Responses** - Type or tap preset prompts to communicate instantly
- **QR Code Scanning** - Scan counter QR codes to join live sessions
- **SMS Confirmation** - Get case numbers and resolution details via SMS
- **USSD Pathway** - Feature phone support via *920*88#
- **Multi-Language** - English and Twi (Ga and Ewe planned)
- **Dual-Language Subtitles** - Toggle EN+TW to see both languages simultaneously
- **Text-to-Speech** - Read aloud any transcript bubble for auditory reinforcement
- **Accessibility First** - Adjustable text sizes, high contrast, screen reader support, reduced motion

### Accessibility Features
- **Adjustable Font Sizes** - Small, Medium, Large, Extra Large
- **High Contrast Mode** - Enhanced visibility for low-vision users
- **Dark/Light Theme** - User preference
- **Screen Reader Compatible** - All content is accessible via assistive technology
- **Reduced Motion** - Respects system motion preferences
- **Skip Links** - Keyboard-friendly navigation to main content
- **Offline Caching** - Data syncs automatically when connection resumes
- **Large Touch Targets** - Mobile-friendly interface
- **Onboarding hints** - First-time user guidance

## 🛠️ Tech Stack

### Backend
- **Python** + **FastAPI** - High-performance API with WebSocket support
- **NumPy** - Numerical processing for audio simulation
- **WebSockets** - Real-time bidirectional communication
- **Pydantic** - Data validation
- **QR Code** - QR code generation for counters

### Frontend
- **React 18** - Modern UI framework
- **Vite** - Lightning-fast build tool
- **Framer Motion** - Smooth animations and transitions
- **Lucide React** - Beautiful icons
- **CSS Variables** - Theming and accessibility

### ASR & NLP
- **Simulated ASR** - Realistic telecom conversation streaming
- **NLP Post-Processing** - Entity extraction for amounts, references, actions
- **Currency Formatting** - Converts "fifty Ghana cedis" → "GHS 50.00"
- **Reference Extraction** - Identifies case numbers, transaction IDs

## 📁 Project Structure

```
hackaton/
├── backend/
│   ├── main.py           # FastAPI server with WebSocket
│   ├── asr_simulator.py  # ASR simulation with realistic telecom data
│   ├── nlp_processor.py  # NLP entity extraction and card generation
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page-level components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── styles/       # CSS styles
│   │   ├── App.jsx       # Main application component
│   │   └── main.jsx      # Application entry point
│   ├── package.json      # Node dependencies
│   ├── vite.config.js    # Vite configuration
│   └── index.html        # HTML template
└── README.md            # This file
```

## 🎮 Demo Mode

The frontend includes a built-in Demo Mode that simulates a complete customer support interaction:

1. Click **"Try Demo"** on the landing page
2. Watch the simulated conversation play out in real-time
3. See pinned cards appear as key information is extracted
4. Adjust playback speed (0.5x, 1x, 1.5x)
5. Pause, skip, or reset at any time

### Demo Narrative for Presentations
- **Problem**: Deaf customers in Ghana rely on interpreters or written notes for service desk support, which is slow, private, and error-prone.
- **Solution**: EchoText turns the agent's spoken words into live captions, pinned action cards, and SMS confirmations—no app download, no interpreter, no wait.
- **Flow**: QR scan → live transcript → quick response → SMS confirmation → case closure in under 5 minutes.
- **Local fit**: MTN branding, Ghana cedis, +233 numbers, USSD fallback *920*88#, English + Twi.

## 🔧 API Endpoints

### REST API
- `GET /api/health` - Health check
- `GET /api/qr/{counter_id}` - Generate QR code for counter
- `GET /api/qr-base64/{counter_id}` - Generate QR code as base64
- `POST /api/sms/send` - Send SMS confirmation
- `GET /api/session/{session_id}` - Get session details
- `GET /api/demo/conversation` - Get demo conversation data
- `GET /api/languages` - Get supported languages

### WebSocket
- `WS /ws/{session_id}` - Real-time transcription stream

## 🎨 Design Principles

### Accessibility
- WCAG 2.1 AA compliant
- Minimum contrast ratio 4.5:1
- Screen reader tested
- Keyboard navigation support
- Focus indicators on all interactive elements
- Reduced motion support

### Visual Design
- Modern gradient aesthetics
- Smooth micro-interactions
- Card-based information architecture
- Clear visual hierarchy
- High contrast text

### User Experience
- <1.5s transcription latency
- No app download required
- Works on any smartphone browser
- Offline-first with auto-sync
- Instant feedback on all actions

## 📊 Performance Targets

- **Latency**: <1.5 seconds end-to-end
- **WER (Word Error Rate)**: <10% in optimal conditions
- **Task Completion**: Under 5 minutes for standard support queries
- **Comprehension**: 95% user understanding in user testing

## 🚀 Deployment

### Production Build

```bash
cd frontend
npm run build
```

### Environment Variables

Create a `.env` file in the backend directory:

```env
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=*
```

## 🤝 Contributing

This is a hackathon MVP. Future improvements:
- Real ASR model integration (UG Voice Transcribe, Akan ASR)
- Real WebRTC audio streaming
- PostgreSQL for session persistence
- Redis for WebSocket scaling
- Real SMS gateway integration
- Mobile app (React Native)
- Additional languages (Ga, Ewe)

## 📄 License

MIT License - Built for EchoText Ghana Hackathon 2026

## 🙏 Acknowledgments

Built with accessibility and inclusion at the core. Designed for Deaf telecommunications customers in Ghana.
