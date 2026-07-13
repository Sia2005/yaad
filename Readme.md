# Yaad

**A memory prosthetic for people living with dementia.** Yaad is a full-stack, AI-grounded memory companion that lets a family build a verified bank of a loved one's memories — their stories, faces, and history — and then hands those memories back to the person, in warm conversational language and spoken aloud, at the moment they are needed.

Most memory technology preserves memories *for the family, for after*. Yaad inverts this: it serves the person who is forgetting, while they are still here.

---

## Table of Contents

1. [The Problem](#the-problem)
2. [What Yaad Does](#what-yaad-does)
3. [System Architecture](#system-architecture)
4. [The Memory Lifecycle](#the-memory-lifecycle)
5. [The RAG Pipeline](#the-rag-pipeline)
6. [Tech Stack and Design Decisions](#tech-stack-and-design-decisions)
7. [Safety and Trust Engineering](#safety-and-trust-engineering)
8. [Threat Model](#threat-model)
9. [RAG Evaluation](#rag-evaluation)
10. [Data Model](#data-model)
11. [Role and Permission Matrix](#role-and-permission-matrix)
12. [Local Setup](#local-setup)
13. [Deployment](#deployment)
14. [Scaling Path](#scaling-path)
15. [Known Limitations and Future Work](#known-limitations-and-future-work)
16. [What I Learned](#what-i-learned)
17. [Acknowledgements and Disclaimer](#acknowledgements-and-disclaimer)

---

## The Problem

Roughly nine million people in India live with dementia, and the large majority are cared for at home by family members who are largely unsupported. Dementia is progressive and, crucially, it takes memory in approximately reverse order: recent events vanish first, while memories from decades ago — a wedding, a childhood home, a favourite song — often remain vivid well into the middle stage of the disease. The cruelty is not only the forgetting but the fear and shame on a person's face when they realise they have forgotten, and the slow exhaustion of a caregiver answering the same question for the sixth time in an hour.

Yaad is built around three well-documented clinical facts rather than around any attempt to treat the disease:

- **Old memories outlast new ones.** A person may not recall today's date but can recognise their own wedding song from forty years ago. This asymmetry is the foundation of the entire product.
- **Familiar voices and music soothe.** Reminiscence therapy — using a person's own photographs, music, and stories to trigger intact long-term memories — is a studied intervention that improves mood and quality of life and reduces agitation. It does not slow the disease, and Yaad never claims that it does.
- **Repetition without irritation is the care standard.** Dementia-care training explicitly instructs families to answer repeated questions calmly, every time, as if for the first time, and never to quiz or correct. An AI never runs out of patience.

Yaad is a care-support tool, not a medical device. It does not diagnose, and every clinically adjacent feature is framed as information for a caregiver to raise with a doctor, never as a clinical judgement.

---

## What Yaad Does

Yaad has two faces sharing one backend.

**The caregiver application** is a conventional responsive web app. A family creates a patient, invites other family members and caregivers under distinct roles, and uploads memories as voice recordings. Each upload is transcribed automatically and enters a review queue. A second family member — never the uploader — approves it before it can ever reach the patient. A weekly dashboard surfaces gentle behavioural flags drawn from the patient's interaction history.

**The Mirror** is the patient-facing surface, designed for a wall-mounted tablet. It is a single full-screen view with enormous type, no navigation, and one action: ask a question. The person (or an attendant) asks anything — *"meri shaadi mein maine kya pehna tha?"* — and the Mirror answers in warm, simple Hinglish, grounded strictly in the family's verified memories, and speaks the answer aloud. When it does not know, it says so gently and redirects to family, rather than inventing an answer.

The distinction that defines the engineering: **a wrong answer here is not a bug, it is the act of gaslighting a vulnerable person in a voice they trust.** Refusal is therefore treated as a first-class success state, not a failure.

---

## System Architecture

Yaad is a MERN application augmented with a background job system and a set of external AI services, all running on free-tier infrastructure.

```
                        ┌─────────────────────────────────────────┐
                        │              CLIENT (React)              │
                        │                                          │
                        │  Caregiver App          The Mirror       │
                        │  - dashboard            - kiosk view      │
                        │  - uploads              - ask + speak     │
                        │  - review queue         - warm refusals   │
                        │  - alert cards          - idle auto-clear │
                        └────────────────┬─────────────────────────┘
                                         │ HTTPS / JWT
                                         ▼
                        ┌─────────────────────────────────────────┐
                        │           API SERVER (Express)           │
                        │                                          │
                        │  Middleware chain:                       │
                        │  requireAuth → requireRole → controller  │
                        │                                          │
                        │  Routes: auth, patients, memories,       │
                        │  members, ask, speak, patterns, audit,   │
                        │  consent                                 │
                        └───┬───────────┬───────────┬──────────────┘
                            │           │           │
              ┌─────────────┘           │           └──────────────┐
              ▼                         ▼                          ▼
      ┌───────────────┐      ┌────────────────────┐     ┌──────────────────┐
      │ MongoDB Atlas │      │  Redis (Upstash)   │     │ Cloudflare R2     │
      │               │      │   BullMQ queues    │     │ (S3-compatible)   │
      │ - users       │      │  - transcription   │     │ - audio uploads   │
      │ - patients    │      │  - embedding       │     │ - cached TTS wav  │
      │ - memories    │      └─────────┬──────────┘     └──────────────────┘
      │ - memorychunks│                │
      │   (+ vectors) │                ▼
      │ - interactions│      ┌────────────────────┐
      │ - auditlogs   │      │   WORKERS (Node)   │
      │ - consents    │      │                    │
      │ - memberships │      │ transcription ─────┼──▶ Groq Whisper
      └───────────────┘      │ embedding ─────────┼──▶ Gemini Embeddings
                             └────────────────────┘
                                         ▲
                        ┌────────────────┴──────────────────┐
                        │        EXTERNAL AI SERVICES        │
                        │  Groq (whisper-large-v3)           │
                        │  Gemini (embeddings, chat, TTS)    │
                        └────────────────────────────────────┘
```

Three processes run independently: the API server, the transcription worker, and the embedding worker. The API accepts requests and responds quickly; the workers do the slow, failure-prone work (transcription, embedding) asynchronously. Killing any worker does not stop the API from accepting uploads — the jobs simply wait in the queue until a worker returns.

### The request lifecycle

Every protected request travels the same path, and understanding it explains most of the system:

```
Request
  → express.json()                     parse body
  → route match                        capture :patientId into req.params
  → requireAuth                        verify JWT signature, attach req.userId
  → requireRole('familyAdmin', ...)    DB lookup of FamilyMembership,
                                       attach req.membership
  → controller                         business logic only
  → response
```

Authentication (who you are) is established cryptographically from the token with no database call. Authorization (what you may do, for this specific patient) is established by a live database lookup on every request. This split is deliberate and is discussed under [Safety and Trust Engineering](#safety-and-trust-engineering).

---

## The Memory Lifecycle

A memory moves through an explicit state machine from upload to being answerable. The accept/process split is the core architectural pattern: the HTTP request does only the fast work and returns immediately, while a queue and worker handle everything slow.

```
Caregiver uploads audio
        │
        ▼
API: store file in R2  ──▶  create Memory(status: processing)  ──▶  enqueue {memoryId}
        │                                                                    │
        └──────────────────── responds 202 in ~1 second                     │
                                                                             ▼
                                                              Redis queue (BullMQ)
                                                                             │
                                                                             ▼
                              Transcription worker picks up job (separate process)
                                    │
                                    ├─ fetch audio from R2
                                    ├─ send to Groq Whisper
                                    └─ save transcript, Memory → pending
                                                    │
                                                    ▼
                            A SECOND family member reviews (never the uploader)
                                    │
                          ┌─────────┴─────────┐
                          ▼                   ▼
                    approved              rejected
                          │
                          ├─ enqueue embedding job
                          ▼
                 Embedding worker
                          ├─ chunk transcript (200 words, 40 overlap)
                          ├─ embed each chunk (Gemini, 768-dim)
                          └─ store MemoryChunk documents with vectors
                                    │
                                    ▼
                       Memory is now retrievable by the Mirror
```

The job payload carries only the memory's ID, never the audio or transcript. The queue carries *intent*; the database carries *truth*. A worker always re-reads the current state from the database at execution time, which makes retried jobs safe: a job that already succeeded finds the memory in a state that causes it to skip. Two independent idempotency strategies are used — check-and-skip in the transcription worker, and delete-then-rebuild in the embedding worker.

---

## The RAG Pipeline

When a question arrives at the Mirror, it is answered by a hand-built retrieval-augmented generation pipeline. No orchestration framework is used; every stage is explicit.

```
Question ("what did she wear at her wedding")
    │
    ▼
Embed the question (Gemini, task type RETRIEVAL_QUERY, 768-dim)
    │
    ▼
Atlas Vector Search  ──  cosine similarity, patient-scoped filter, top-k = 4
    │                    (numCandidates 100 → precise re-rank → 4)
    ▼
Score floor filter  ──  chunks below threshold are discarded
    │
    ├── no chunks survive ──▶ return exact refusal (LLM never called)
    │
    ▼
Build grounded prompt  ──  strict rules: answer only from these memories,
                           warm Hinglish, never quiz, never correct,
                           refuse exactly if the answer is absent
    │
    ▼
Gemini generation  ──  temperature 0.3, thinking-model budget
    │
    ▼
Answer + source receipts (memory IDs, chunk IDs, scores)
    │
    ▼
(optional) Text-to-speech ──▶ content-addressed cache in R2 ──▶ spoken aloud
```

The vector search is patient-scoped **inside the index** via a filter field, so one family's search can never surface another family's memories — a privacy guarantee enforced at the database layer rather than in application code. Retrieved memories carry their similarity scores through to the response as receipts, which the caregiver UI can display and which the evaluation suite uses to verify grounding.

The system demonstrates genuine cross-lingual retrieval: an English question reliably retrieves a Hindi memory it shares no words with, because both are embedded into the same multilingual meaning-space. In testing, the English query *"what did she wear at her wedding"* scored higher against a Devanagari memory than the transliterated keyword *"shaadi"* did.

---

## Tech Stack and Design Decisions

The entire system runs on free-tier services. Every choice below was made deliberately, and the alternatives were considered rather than ignored.

| Layer | Choice | Alternatives considered | Why this choice |
|---|---|---|---|
| Frontend | React (Vite) | Next.js | No SEO or SSR needed for a private care app; classic React keeps the MERN story pure and focuses learning on backend fundamentals. |
| Backend | Node + Express | — | Core of the MERN stack; middleware model maps cleanly to the auth/role/controller pipeline. |
| Database | MongoDB (Mongoose) | PostgreSQL | Memories are heterogeneous documents (audio + transcript + tags + people); a document store fits naturally where SQL would fight the shape. |
| Vector search | MongoDB Atlas Vector Search | Pinecone, Chroma, Qdrant | Keeps vectors in the same database as the source data — no second datastore to keep in sync, and deletions/cleanup stay in one place. A sharper answer than the default tutorial stack. |
| RAG orchestration | Hand-written | LangChain, LlamaIndex | Building retrieval and grounding by hand teaches what they actually are; a framework hides exactly the machinery that matters here. |
| Job queue | BullMQ + Redis | Direct synchronous calls | Transcription and embedding are slow and fail transiently; a queue provides retries, backoff, and durability, and decouples the API from worker failures. |
| Transcription | Groq (whisper-large-v3) | OpenAI Whisper API | Groq hosts the same open Whisper model on a genuinely free tier with an OpenAI-compatible API; no code change beyond a base URL. |
| Embeddings | Gemini gemini-embedding-001 | OpenAI embeddings | Free tier, strong multilingual performance; output truncated to 768 dimensions via Matryoshka representation learning for 4x storage savings on a constrained free-tier cluster. |
| Generation | Gemini flash-lite tier | Larger models | The task is constrained composition over provided context, not open reasoning; a lite model is validated as sufficient by the evaluation suite, and its daily quota (≈1000 requests) makes development viable. |
| Text-to-speech | Gemini TTS + R2 caching | ElevenLabs cloning (paid) | Free stock voice for v1; content-addressed caching means repeated questions — the core dementia workload — replay instantly at zero cost. Voice cloning is a documented, consent-gated upgrade path. |
| Object storage | Cloudflare R2 | AWS S3 | S3-compatible API (so the AWS SDK works unchanged), with zero egress fees on the free tier. |
| Auth | JWT + hand-built RBAC | Firebase, Supabase, Auth0 | Building auth from first principles is the point; a managed service would hide the exact security machinery the project is meant to demonstrate. |
| Realtime | Polling | WebSockets (Socket.io) | Polling is sufficient for the dashboard; adding websockets would be complexity for its own sake. |

A recurring theme worth naming: **pinned model names are infrastructure dependencies that rot.** Over the course of the build, three separate Google model identifiers were deprecated or gated out from under working code. Generation and TTS model names are consequently stored in environment variables so that a future deprecation is a configuration change rather than a code change, and the API's own model-listing endpoint is used to discover what a given key can actually call.

---

## Safety and Trust Engineering

Because Yaad serves cognitively vulnerable users, safety is architectural rather than cosmetic.

**Two-layer hallucination defence.** The first layer is a similarity-score floor: retrieved chunks below a threshold are discarded before the language model is ever invoked, so an irrelevant question is refused at zero model cost. The second layer is a strict prompt instruction to answer only from the provided memories and otherwise emit an exact refusal string. During the build, an embedding-model migration silently compressed the score distributions and defeated the floor — and the second layer held, refusing correctly. This is defence-in-depth demonstrated by accident: one layer failed, the other caught it.

**Two-person memory approval.** A memory cannot be approved by the person who uploaded it; the rule is enforced at the schema level, not merely in a controller. The threat this defends against is concrete: a person with dementia cannot fact-check what they are told, so a single malicious relative could otherwise insert a false memory — a fabricated statement about inheritance, for instance — which the system would then repeat to the patient in a trusted voice. Two-person approval makes memory-poisoning require collusion.

**Identity versus authority.** Authentication is cryptographic and stateless; authorization is a live database lookup on every request. This is deliberate: roles are per-patient (a person may be an administrator for one patient and a contributor for another), so a role cannot live in a global token — and because a stolen or stale token cannot be un-issued, a role baked into a token would let a *removed* caregiver retain access until the token expired. For an app protecting a vulnerable person, that window is a safety flaw, not an inconvenience. Checking authority live means revocation takes effect on the very next request.

**Immutable audit log.** Every governed action writes an append-only record of actor, action, target, and detail. Immutability is enforced by construction: the API surface simply contains no update or delete verb for audit entries.

**Consent as a first-class state machine.** Each patient has a consent record with states of active, delegated, and frozen. Freezing blocks the patient-facing surfaces — the Mirror goes quiet — while leaving caregiver management intact, which is exactly what a family navigating a dispute or executing an advance directive needs. Voice cloning is gated behind an explicit consent flag that defaults to off.

**Care-tool boundary.** Behavioural flags use flag language, never diagnostic language: *"this may be worth mentioning at the next doctor visit,"* never a conclusion. The care-standard tone rules — never quiz, never correct, meet the person in their reality, answer as if for the first time — are encoded directly in the generation prompt.

---

## Threat Model

The system was tested against a scripted set of adversarial attacks against a running instance. Results are reported honestly, including gaps.

| # | Attack | Risk probed | Result |
|---|---|---|---|
| 1 | Uploader approves their own memory | Memory poisoning | **Blocked** — 403; schema-level uploader ≠ approver guard |
| 2 | Contributor invites a family administrator | Privilege escalation | **Blocked** — 403; invitation gated to administrators |
| 3 | Attendant reads analytics and audit log | Over-broad access by hired help | **Blocked** — 403 on analytics and audit; the Mirror question endpoint returns 200, so the role does its one job and nothing more |
| 4 | Request a non-existent patient ID | Existence leak / cross-tenant probe | **Blocked** — 403, identical to the forbidden-but-real case; no information about which patients exist |
| 5 | Replay an expired access token | Token theft | **Blocked** — 401; the fifteen-minute token lifetime caps the replay window |
| 6 | Search memory content while consent is frozen | Freeze bypass | **By design** — freeze blocks the patient-facing Mirror; caregiver search remains available, because caregivers must manage the bank during the very disputes that prompt a freeze. A stricter freeze-everything mode is a reasonable future toggle. |
| 7 | Upload a non-audio file disguised as audio | Pipeline crash via malformed input | **Handled** — the upload is accepted, transcription fails, retries are exhausted, and the memory lands in a `failed` state with a reason rather than crashing the worker |

Two gaps were discovered through this exercise and are documented rather than hidden:

- **Member removal is not implemented.** The schema carries a `removed` status, but no endpoint yet flips it, so a compromised caregiver cannot currently be revoked through the API. This is the highest-priority item in future work.
- **The token refresh endpoint is designed but not built.** Refresh tokens are issued and persisted with a seven-day lifetime, but the endpoint that would exchange one for a new access token does not yet exist. This paradoxically closes the replay hole (there is no refresh path to abuse) while breaking the intended user experience of not having to log in every fifteen minutes.

---

## RAG Evaluation

The retrieval-and-answer pipeline is measured, not assumed. An evaluation suite runs a set of cases against a live corpus: *answerable* cases, where the corpus contains the answer and the reply must not be a refusal and must contain expected keywords; and *must-refuse* cases, where the corpus provably lacks the answer and the only correct reply is the exact refusal string.

The runner records, for every case, the top retrieval score, so that the score threshold can be placed empirically from measured distributions rather than guessed. It respects the free-tier rate limit with pacing between cases, and retries transient upstream errors with backoff.

A representative baseline run:

| Metric | Result |
|---|---|
| Generation model | gemini flash-lite tier |
| Answer rate (answerable cases handled correctly) | full pass |
| Refusal rate (must-refuse cases refused correctly) | full pass |
| Answerable-question top-score range | 0.8425 – 0.8542 |
| Must-refuse-question top-score range | 0.7636 – 0.7947 |

The separation between the two score bands (nothing answerable below 0.8425, nothing must-refuse above 0.7947) shows a clean gap where a score threshold can sit. The threshold is nonetheless kept deliberately coarse and the language-model refusal treated as the primary defence, because the current corpus is small; the threshold will be recalibrated once the distributions are backed by a larger sample. Measuring the model's behaviour, rather than trusting it, is the point.

---

## Data Model

| Collection | Purpose | Notable fields |
|---|---|---|
| `users` | Accounts | name, email (unique), password (bcrypt, never selected by default) |
| `patients` | The person being remembered | name, preferredLanguage, stage, consent link; no login of their own |
| `familymemberships` | The join between a user and a patient, carrying the role | user, patient, role, status; compound unique index on (user, patient) |
| `consents` | Per-patient consent state machine | state (active/delegated/frozen), voiceCloningPermitted |
| `memories` | An uploaded memory and its lifecycle | uploadedBy, approvedBy, status, transcript, mediaKey; schema guard that approver ≠ uploader |
| `memorychunks` | The RAG corpus | memory, patient, text, embedding (768-dim vector) |
| `interactions` | Every Mirror question, for pattern detection | normalizedQuestion, refused, topScore, hourOfDay |
| `auditlogs` | Append-only record of governed actions | actor, action, target, detail |
| `refreshtokens` | Persisted refresh tokens with TTL | user, token, expiresAt |

A key modelling decision: **role lives on the membership, not on the user**, because a role is a property of the relationship between a user and a specific patient, not a property of the user in isolation. The compound unique index on the membership guarantees, at the database level, that a user holds exactly one role per patient.

---

## Role and Permission Matrix

| Capability | Family Admin | Contributor | Attendant | Clinician |
|---|---|---|---|---|
| View patient | Yes | Yes | Yes | Yes |
| Upload memory | Yes | Yes | No | No |
| Approve/reject memory | Yes | No | No | No |
| Invite / manage members | Yes | No | No | No |
| Operate the Mirror (ask/speak) | Yes | Yes | Yes | No |
| View analytics / patterns | Yes | Yes | No | Yes |
| View audit log | Yes | No | No | No |
| Manage consent | Yes | No | No | No |

The two most instructive rows are the attendant and the clinician. A hired attendant operates the Mirror daily but is walled off from analytics and audit — they do the work, they do not surveil the family. A clinician sees the behavioural signal but never the memory content or the raw audit trail — they get what a doctor needs, and nothing more.

---

## Local Setup

### Prerequisites

- Node.js 20+ (installed via `nvm` on Linux/WSL2; the system Node on some platforms is too old)
- Free accounts on: MongoDB Atlas, Cloudflare R2, Upstash (Redis), Groq, and Google AI Studio (Gemini)

### Environment

The server reads a `.env` file (never committed). Required variables:

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5000) |
| `MONGO_URI` | Atlas connection string, including the database name |
| `JWT_ACCESS_SECRET` | Signing secret for short-lived access tokens |
| `JWT_REFRESH_SECRET` | Signing secret for refresh tokens |
| `REDIS_URL` | Upstash Redis connection URL (TLS, `rediss://`) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | R2 bucket name |
| `GROQ_API_KEY` | Groq key for Whisper transcription |
| `GEMINI_API_KEY` | Gemini key for embeddings, generation, and TTS |
| `GEMINI_CHAT_MODEL` | Generation model identifier (env-stored so deprecations are config changes) |
| `GEMINI_TTS_MODEL` | Text-to-speech model identifier |

### Running

The system runs as four processes. Three are the backend and its workers, from the `server` directory; the fourth is the client.

```bash
# From server/
npm install
npm run dev          # API server
npm run worker       # transcription worker (separate terminal)
npm run embed-worker # embedding worker (separate terminal)

# From client/
npm install
npm run dev          # React client
```

A one-time infrastructure step is required in the Atlas dashboard: create a Vector Search index named `chunk_vector_index` on the `memorychunks` collection, with a 768-dimension cosine vector field on `embedding` and a filter field on `patient`.

---

## Deployment

| Component | Platform | Notes |
|---|---|---|
| API server | Render (or Railway) | Containerised; free tier sleeps when idle |
| Workers | Render background workers | Same image, different start command |
| Frontend | Vercel | Static build, generous free tier |
| Database + vectors | MongoDB Atlas M0 | 512 MB; media kept out of the database |
| Redis | Upstash | Free command quota |
| Object storage | Cloudflare R2 | 10 GB, zero egress |
| Uptime and errors | UptimeRobot, Sentry | Free tiers sufficient at pilot scale |

Total running cost at demo and pilot scale is effectively zero. The one operational caveat is that free-tier backend hosts sleep when idle, so a scheduled ping keeps the service warm during a demo window.

---

## Scaling Path

The v1 target is modest by design: on the order of tens of families, a handful of concurrent users, a couple of hundred memories per patient, and sub-two-second answer latency. The path beyond that, in priority order:

1. **Answer caching.** Repeated questions are the defining workload of this domain; a Redis cache keyed on the normalised question would serve the large majority of Mirror requests without touching the model at all. This is the cheapest and highest-impact change.
2. **Horizontal API scaling.** The Express server is stateless by design (JWT, no server-side sessions), so it scales to N replicas behind a load balancer with no code change.
3. **Worker pool scaling.** BullMQ concurrency and dedicated worker processes for the transcription and embedding queues, scaled independently by their different load profiles.
4. **Database tier.** A paid Atlas tier with dedicated Search Nodes isolates the vector workload; read replicas serve the analytics queries.
5. **Media and audit archival.** R2 already scales; audit entries can move to cold storage after a retention window.
6. **Multi-tenancy.** A patient-keyed sharding strategy supports a future care-home mode.

The binding constraint at free tier is not compute but the daily request quotas of the AI services, which is precisely why the caching strategy sits at the top of the list.

---

## Known Limitations and Future Work

- **Member removal endpoint** — the schema supports it, the API does not yet expose it. Highest priority, both for security and for completeness of the admin layer.
- **Token refresh endpoint** — designed and half-built (tokens are persisted); the exchange endpoint remains to be implemented so users are not forced to re-authenticate every fifteen minutes.
- **Patient-local time handling** — the sundowning window relies on hour-of-day, currently recorded in the server's UTC clock; it must be computed in the patient's local timezone for the evening-activity flag to be meaningful.
- **Empty-transcript handling** — a silent or unintelligible recording can produce a near-empty transcript that should be flagged rather than allowed to proceed to approval.
- **Transactional writes** — several multi-step operations (creating a patient with its membership and consent; uploading a file, creating a record, and enqueuing a job) are not yet wrapped in transactions, so a crash mid-sequence can orphan a record. Atlas supports the transactions needed to close this.
- **Person cards on the Mirror** — the "this is your grandson Arjun" recognition card, with photo and relationship, is designed but not yet built; it requires the photo-upload path.
- **Face clustering, self-hosted models, offline-first Mirror, additional Indian languages, and a care-home multi-patient mode** — all deferred deliberately as post-v1 scope.

---

## What I Learned

This project was built as a deliberate exercise in engineering depth rather than feature count, and the most valuable lessons came from the failures rather than the successes.

- **Model names rot.** Three Google model identifiers were deprecated or access-gated out from under working code during the build. The durable fix was to treat model names as configuration and to query the provider for what a key can actually call, rather than trusting any documentation — including recent documentation.
- **Defence in depth is real, not a slogan.** A silent embedding-model change compressed the retrieval score distributions and defeated the first hallucination-defence layer. The system did not hallucinate, because the second layer held. Watching that happen was more convincing than any argument for redundancy.
- **Verify assumptions before trusting them.** A recurring class of confusion came from assuming a component worked because it existed — a worker that was running but had never actually processed a job, a "working" login that was talking to a stale server. Cheap to check, expensive to assume.
- **The queue carries intent; the database carries truth.** Building idempotent workers by hand — check-and-skip in one, delete-and-rebuild in the other — made concrete why at-least-once job systems demand that workers re-read state rather than trust their payload.
- **Read the error, then read the right log.** The client reports *that* something broke; the server log reports *why*. A disciplined taxonomy of error signatures — module-not-found versus reference-error versus handler-must-be-a-function versus unexpected-end-of-input — turned most debugging from guesswork into a lookup.
- **Domain shapes design.** Generic patterns (JWT auth, RBAC, job queues) took on specific weight because of who this app serves: a fifteen-minute token window is a shrug in most apps and a safety flaw in this one; a refusal is an annoyance in most chatbots and the core safety feature here.

---

## Acknowledgements and Disclaimer

Yaad's design follows publicly documented principles of dementia care and reminiscence therapy. Organisations such as the Alzheimer's and Related Disorders Society of India (ARDSI) run memory cafés and caregiver support across the country and are the right point of contact for anyone building seriously in this space.

**Yaad is a care-support tool, not a medical device.** It does not diagnose, treat, or make clinical judgements. Every behavioural signal it surfaces is intended as information for a caregiver to raise with a qualified doctor. Nothing in this project should be interpreted as medical advice.


