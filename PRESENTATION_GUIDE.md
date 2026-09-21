# EchoText Ghana — Presentation Guide

Use this guide to structure your demo and Q&A around the judging criteria.

---

## 1. Communication Support & Two-Way Interaction — 20 pts

### What to demo
- Start on the landing page, click **Try Demo**.
- Show the live transcript appearing in real time.
- Type a quick-response chip or custom message as the customer.
- Show the agent receiving it and replying.
- Complete the flow and show the SMS confirmation card with the case number.

### What to say
- “We have end-to-end two-way communication: customer input, agent transcript, and SMS confirmation.”
- “Offline messages are queued and synced when connection resumes.”
- “The WebSocket contract supports pause/resume and real-time status updates.”

### Q&A preparation
- **Q: Is the ASR real?** A: The ASR is simulated for the prototype, but the WebSocket schema and backend endpoints are designed to plug in a real ASR/NLP service without changing the frontend.
- **Q: How does the agent respond?** A: In the demo, agent replies are simulated. In production, the agent would type or speak into the dashboard, and their speech would be transcribed the same way.
- **Q: Is there a typing indicator?** A: Not in the current prototype, but the architecture supports it via WebSocket presence events.

---

## 2. Ghanaian-Language Support — 10 pts

### What to demo
- On the transcription page, click **TW** to switch to Twi.
- Show the conversation continuing in Twi.
- Click **EN+TW** to show dual-language subtitles.
- Point out the English and Twi lines appearing simultaneously.

### What to say
- “We support English and Twi out of the box, with Ga and Ewe on the roadmap.”
- “The dual-language toggle lets agents and customers see both languages at once, which is critical in a multilingual service center.”
- “The backend translation endpoint can translate any conversation tree on the fly.”

### Q&A preparation
- **Q: Is the Twi natural?** A: The Twi tree was authored for this demo. In production, we would engage native speakers and linguistic reviewers to ensure natural service-desk register.
- **Q: What about other languages?** A: The translation endpoint is language-agnostic. Ga and Ewe are planned for v2.
- **Q: How does TTS work for Twi?** A: We use the browser’s SpeechSynthesis API with `tw-GH` locale. For production, we would integrate a verified Twi TTS model.

---

## 3. Accessibility & Inclusion of Persons with Disabilities — 20 pts

### What to demo
- Open the accessibility controls panel.
- Increase font size through all four steps.
- Toggle high-contrast mode.
- Toggle dark/light theme.
- Toggle reduced motion and show animations stopping.
- Use the **Read aloud** button on a transcript bubble.
- Show the skip link by pressing `Tab` on page load.

### What to say
- “Accessibility is not an afterthought; it’s the foundation. This product is designed for Deaf users first, but it works for low-vision, neurodivergent, and elderly users too.”
- “All interactive elements have focus indicators. We respect system motion preferences. Screen readers can announce status changes via `aria-live` regions.”
- “Dual-language subtitles help not just Deaf users, but also agents and customers who prefer reading over listening.”

### Q&A preparation
- **Q: Have you tested with Deaf users?** A: Not yet in this prototype phase. User testing with Deaf Ghanaian customers is our immediate next step.
- **Q: What about sign language?** A: Sign language interpretation is out of scope for v1, but the text-first design is standards-aligned for Deaf accessibility. We can integrate video relay in v2.
- **Q: Is the contrast ratio sufficient?** A: Yes, we meet WCAG 2.1 AA with 4.5:1 minimum contrast, and high-contrast mode increases it further.

---

## 4. Technical Fit, Prototype Functionality & Implementation — 20 pts

### What to demo
- Show the architecture: FastAPI backend → WebSocket → React frontend.
- Show the QR code generation endpoint working.
- Show the `/api/languages` endpoint listing supported languages.
- Show the offline retry flow: disconnect network, show banner, reconnect, show “Connection restored”.
- Show the session state persisting across language switches.

### What to say
- “The backend is a FastAPI server with WebSocket support, CORS, QR generation, SMS simulation, and a translation endpoint.”
- “The frontend is React with hooks, WebSocket client, Framer Motion, and responsive mobile layout.”
- “The ASR simulator yields partial transcripts with confidence scores, demonstrating how real streaming would work.”
- “We have offline-first retry logic and auto-reconnection.”

### Q&A preparation
- **Q: Is there a database?** A: Sessions are in-memory for this prototype. Production would use PostgreSQL for persistence and Redis for WebSocket scaling.
- **Q: How do you handle scaling?** A: Redis pub/sub would allow multiple WebSocket instances. The current design is stateless except for session memory.
- **Q: What about security?** A: CORS is open for prototype ease. Production would restrict origins and add authentication.
- **Q: Can you swap in real ASR?** A: Yes. The WebSocket message schema is designed for real streaming ASR. The simulator mimics the same contract.

---

## 5. UX/UI, Usability & Local Fit — 10 pts

### What to demo
- Show the landing page with MTN branding, Ghana cedis, +233 numbers, USSD code.
- Show the scan → read → respond → SMS flow on a mobile viewport.
- Show the quick-response chips reducing typing burden.
- Show the pinned summary cards.
- Show the mobile menu overlay.

### What to say
- “This is designed for Ghanaian service centers: MTN branding, Ghana cedis, local phone numbers, and USSD fallback for feature phones.”
- “The flow is optimized for mobile: no app download, works in any browser, large touch targets.”
- “Quick-response chips and pinned cards reduce cognitive load in a noisy, fast-paced environment.”

### Q&A preparation
- **Q: Have you user-tested this?** A: Not yet. User testing with Deaf Ghanaian customers and MTN agents is our next milestone.
- **Q: Is the QR scanning real?** A: QR generation is real; scanning is simulated in the prototype. In production, we would use a real camera-based QR decoder.
- **Q: What if the customer doesn’t speak English?** A: Twi is supported, and the dual-language mode helps in mixed-language conversations.

---

## 6. Adoption & Continued Use — 10 pts

### What to demo
- Show the USSD fallback pathway (`*920*88#`).
- Show the SMS confirmation as a durable offline record.
- Show the session ID for rejoining.
- Mention the multi-language roadmap.

### What to say
- “We designed for adoption, not just innovation. USSD reaches feature-phone users who can’t run a browser app.”
- “SMS confirmation creates a durable record customers can keep.”
- “No app download, no account creation, no data entry—just scan and read.”
- “Multi-language support and privacy-first design make this viable for national rollout.”

### Q&A preparation
- **Q: How do you measure success?** A: Task completion time, user comprehension, and agent throughput. We target <5 minutes per query and 95% comprehension.
- **Q: What’s the business model?** A: This is an MVP. Production models could include SaaS for telcos, per-session SMS fees, or government/NGO partnership for accessibility programs.
- **Q: How do you prevent churn?** A: By embedding into existing MTN workflows, requiring no new app, and delivering immediate value to both customers and agents.

---

## 7. Presentation Clarity & Responses to Questions — 10 pts

### What to demo
- Have a 3-slide narrative ready:
  1. **Problem**: Deaf customers in Ghana rely on interpreters or written notes, which is slow and private.
  2. **Solution**: EchoText turns spoken support into live captions, pinned cards, and SMS confirmations.
  3. **Architecture**: FastAPI backend → WebSocket → React frontend → simulated ASR/NLP.
- Keep the live demo under 2 minutes.
- Leave 3+ minutes for Q&A.

### What to say
- “Our demo today is a working prototype. The ASR and agent replies are simulated, but the WebSocket contract, frontend UX, and backend endpoints are production-structured.”
- “We prioritized accessibility and local fit from day one.”

### Q&A preparation
- **Tough question template**: “In the prototype, [X] is simulated. The architecture is designed to swap in [real component] without changing the frontend. Our next step is [specific action].”
- Be honest about what’s simulated vs. production-ready.
- If you don’t know an answer, say “That’s a great question. We would address that in our next sprint by [approach].”

---

## Demo Script (3 minutes max)

1. **Landing page** (15s): “EchoText is a mobile-first accessibility tool for Deaf telecommunications customers in Ghana.”
2. **Start demo** (10s): Click **Try Demo**.
3. **Live transcript** (30s): Show agent transcript appearing, pinned cards extracting entities.
4. **Customer response** (20s): Click a quick-response chip or type a message.
5. **Dual language** (15s): Toggle **EN+TW** to show both languages.
6. **SMS confirmation** (15s): Complete the flow, show SMS card with case number.
7. **Accessibility** (15s): Briefly show font resize and high-contrast toggle.

## Q&A Strategy

- **Lead with the user story**: A Deaf woman at an MTN counter resolves a MoMo issue independently in under 5 minutes.
- **Be transparent about simulation**: ASR and agent auto-replies are simulated placeholders.
- **Emphasize local fit**: MTN, Ghana cedis, Twi, USSD, no app download.
- **Highlight accessibility**: Text-first, screen-reader compatible, high contrast, reduced motion.
- **Show technical maturity**: FastAPI, WebSocket, React, offline retry, modular architecture.
