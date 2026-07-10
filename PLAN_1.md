# Yaad — Project Master Plan

> A memory prosthetic for dementia patients: a family-built, AI-grounded memory bank
> that hands a person back to themselves — in their own voice.
>
> This file is the single source of truth for scope, checkpoints, and decisions.
> Update checkboxes as you go. Nothing ships to resume until its phase is fully checked.

---

## 1. Scope — What v1 WILL do (the "conquer" list)

- Multi-role family accounts around one patient (Family Admin / Contributor / Attendant / Clinician)
- Memory ingestion: audio + photo upload → background transcription (Whisper) → pending state
- Two-person memory approval workflow (anti-poisoning defense)
- RAG core: chunking → embeddings → MongoDB Atlas Vector Search → grounded answers with refusal behavior + source-clip receipts
- The Mirror: patient-facing kiosk UI — person cards, repeated-question answering, TTS playback in patient's own cloned voice (ElevenLabs, consent-gated)
- Interaction logging → pattern flags (repeated-question spikes, time-of-day confusion) → caregiver alerts ("mention to doctor" framing, never diagnosis)
- Immutable audit log on every mutation
- Consent lifecycle state machine (active → delegated → frozen)
- Hindi + English support in transcription and Mirror responses
- RAG eval suite: ~30 known Q/A + must-refuse cases, with measured faithfulness score
- Dockerized backend, deployed and publicly demoable

## 2. Explicitly OUT of v1 (README "Future Enhancements" section)

| Enhancement | What it adds | Why deferred |
|---|---|---|
| Face clustering on photo pool | Auto-tag people across family photos | Needs Python microservice + GPU-ish compute; legit phase-2 story |
| Self-hosted Whisper + XTTS | Zero API cost, data never leaves server | Needs GPU hosting; wrong fight at demo scale |
| WebSockets (Socket.io) | Live dashboard updates | Polling suffices; resist resume-driven development |
| Native mobile app (React Native) | Attendant convenience | Web-first proves the concept |
| Care-home / multi-patient org mode | B2B expansion, org-level RBAC | Family mode must be solid first |
| More Indian languages (Marathi, Tamil, Bengali) | Wider reach | Whisper supports them; UI/prompt work deferred |
| Offline-first Mirror (PWA + local cache) | Works through internet outages | Real need, meaningful complexity |
| ML model for sundowning prediction | Predictive alerts vs. threshold rules | Needs months of real interaction data first |
| Reminiscence session planner | AI-curated nightly therapy sessions | Layer on top of stable RAG core |
| Clinician export (PDF reports) | Doctor-visit summaries | Easy add after patterns work |

## 3. Scale targets

### v1 (free tier, demo + pilot scale)
Target: **10–50 families, ~5 concurrent users, ~200 memories/patient, <2s Mirror answer latency (p95)**

| Concern | Free service | Free-tier limit | Our headroom strategy |
|---|---|---|---|
| Database + vectors | MongoDB Atlas M0 | 512 MB storage | Store only text+vectors+metadata in DB; all media in R2 |
| Media storage | Cloudflare R2 | 10 GB, zero egress fees | Compress audio to opus/64kbps on ingest |
| Queue/Redis | Upstash | 10k commands/day | Batch job updates; low polling frequency |
| Backend + worker | Render (or Railway trial) | Sleeps after idle | Acceptable for demo; cron-ping during demo week |
| Frontend | Vercel | Generous | Static, no concern |
| Transcription | OpenAI Whisper API | Pay-per-use (cheap) | ~₹0.3/min audio; few hundred ₹ total |
| LLM (RAG answers) | Claude/GPT API | Pay-per-use | Small context (top-k=4 chunks), cache repeated questions |
| TTS own-voice | ElevenLabs free tier | ~10 min/month | Pre-generate + cache common answers (name cards, routines) — this is a feature, not a hack: repeated questions get instant cached audio |
| Monitoring | UptimeRobot + Sentry free | Fine at this scale | |

### Scale-up plan (README "Scaling" section — the interview answer)
1. **Caching layer**: Redis cache for Mirror answers (repeated questions are THE workload — >80% cache-hit expected by disease profile). Biggest win, cheapest change.
2. **Horizontal API scaling**: stateless Express (JWT, no sessions) → N replicas behind a load balancer. Already stateless by design.
3. **Worker pool scaling**: BullMQ concurrency + separate worker dynos for transcription vs. embedding queues.
4. **DB**: Atlas M10+, dedicated Search Nodes for vector workload isolation; read replicas for analytics.
5. **Media**: R2 + CDN URLs already scale; add signed-URL expiry hardening.
6. **Audit log**: move to append-only cold storage (R2) after 90 days if volume demands.
7. **Multi-tenancy**: org-level sharding key (patientId) if care-home mode lands.

## 4. README structure (write as we go, not at the end)

1. **Hero** — name, one-line pitch, demo GIF, live link, badge row
2. **The problem** — dementia in India, the caregiver burden, why memory-for-the-forgetter is an inversion
3. **What Yaad does** — feature tour with screenshots (Mirror + caregiver dashboard)
4. **Architecture** — diagram (client / API / queue / workers / Atlas / R2 / external AI APIs), request lifecycle, upload-to-live-memory pipeline diagram
5. **Tech stack + Decisions table** — every choice vs. alternatives considered and WHY (Atlas Vector Search vs Pinecone/Chroma; hand-rolled RAG vs LangChain; React+Express vs Next.js; BullMQ vs direct calls; API AI vs self-hosted; JWT+RBAC by hand vs Firebase/Supabase; polling vs websockets)
6. **The safety design** — grounding + refusal behavior, two-person approval / memory-poisoning threat model, audit immutability, consent state machine, "care tool not medical device" boundary
7. **RAG evaluation** — eval suite methodology, faithfulness/refusal metrics, results table
8. **Data model** — schema overview with the role/permission matrix
9. **Local setup** — env vars table, docker-compose, seed script
10. **Deployment** — architecture on free tiers, costs table
11. **Scaling path** — section 3 above, condensed
12. **Future enhancements** — section 2 above
13. **What I learned** — honest engineering retrospective (interviewers read this)
14. **Acknowledgments** — dementia care references (ARDSI etc.), disclaimer

## 5. Phase checklists — definition of done per phase

### Phase 0 — Skeleton & environment
- [ ] Node 20+ via nvm on WSL2; repo initialized with folder structure
- [ ] Atlas M0 cluster created; connection string in `.env`; `.gitignore` covers `.env`
- [ ] Tiny throwaway CRUD app works (request lifecycle understood — can explain aloud)
- [ ] README hero + problem statement drafted (yes, already)
**Checkpoint: explain request lifecycle unprompted.**

### Phase 1 — Auth & family model (admin layer foundations)
- [ ] Schemas: User, Patient, FamilyMembership (role enum), Consent (state machine skeleton)
- [ ] Register/login with hashed passwords (bcrypt), JWT access + refresh tokens
- [ ] `requireAuth` + `requireRole` middleware; role/permission matrix documented
- [ ] Invite flow: Family Admin invites members with assigned roles
- [ ] README: data model section started
**Checkpoint: explain JWT flow + why attendant can't see private memories.**

### Phase 2 — Memory ingestion pipeline
- [ ] R2 bucket + signed upload flow; audio compressed on ingest
- [ ] BullMQ queue + worker process; job states surfaced to UI (uploading → transcribing → pending approval)
- [ ] Whisper API integration in `whisper.service.js` (Hindi tested with a real sample)
- [ ] Memory document created in `pending` state with transcript
- [ ] Failure handling: retries, dead-letter behavior, user-visible error state
- [ ] README: pipeline diagram added
**Checkpoint: narrate upload→pending flow including what happens when Whisper fails.**

### Phase 3 — RAG core (the heart)
- [ ] Chunking strategy decided + documented (size/overlap and WHY)
- [ ] Embedding service; vectors stored in Atlas; vector index created
- [ ] Retrieval endpoint: query → top-k chunks with scores
- [ ] Grounded answer prompt with strict refusal instruction; source memory IDs returned as receipts
- [ ] Refusal behavior verified: out-of-corpus questions get warm refusal, not hallucination
- [ ] **Eval suite: ~30 cases (20 answerable, 10 must-refuse), scored, results saved**
- [ ] Answer cache keyed on normalized question (Redis)
- [ ] README: RAG section + eval results table
**Checkpoint: explain embeddings, cosine similarity, and the eval methodology to a rubber duck.**

### Phase 4 — The Mirror
- [ ] Kiosk-mode route, huge type, zero navigation depth, cognitive-accessibility choices documented
- [ ] Person cards ("Yeh Arjun hai…") with photo + relationship + story snippet
- [ ] ElevenLabs voice clone (consent-gated flag checked in code path) + pre-generated cached audio for common answers
- [ ] Ask-anything flow: mic/text → RAG → answer + own-voice playback + never quizzes, always tells
- [ ] Tone rules enforced in prompt (meet them in their reality; no corrections)
**Checkpoint: demo the Mirror to your mom; watch where she gets confused — that's your bug list.**

### Phase 5 — Patterns & alerts
- [ ] Interaction logging on every Mirror exchange (question, matched intent, timestamp)
- [ ] Repeated-question spike detection + evening-confusion (sundowning) time-bucket flags
- [ ] Caregiver dashboard: trends chart + "mention this to the doctor" alert cards (framing audited — zero diagnostic language)
- [ ] Clinician role sees analytics only, verified by tests
**Checkpoint: explain why this is flagging, not diagnosis, and where that line is in the code.**

### Phase 6 — Admin layer with teeth
- [ ] Approval workflow: approve/reject endpoints; `approvedBy !== uploadedBy` enforced at schema level
- [ ] Immutable audit log via Mongoose hooks; no update/delete route exists for it
- [ ] Consent state machine wired: frozen state blocks Mirror + TTS globally
- [ ] Role change + member removal flows with audit entries
- [ ] Threat-model writeup in README (memory poisoning, attendant overreach, consent expiry)
**Checkpoint: adversarial hour — try to poison a memory, escalate a role, read as attendant. Document every hole found and fixed.**

### Phase 7 — Deploy, polish, prove
- [ ] Dockerfile (+ compose for local); backend + worker on Render; frontend on Vercel; Upstash Redis; env documented
- [ ] Seed script: demo family "the Sharmas" with realistic Hindi memories
- [ ] 2–3 min demo video: upload → approve → Mirror answering in own voice → refusal case → caregiver alert
- [ ] README finished to section list above; decisions table complete
- [ ] Sentry + UptimeRobot wired
- [ ] (Stretch) One conversation with ARDSI chapter / memory café — notes added to README acknowledgments
**Checkpoint: a stranger can clone, seed, and run it from README alone.**

---


