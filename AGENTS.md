# AGENTS.md: Live Session Counter

This file tells an AI coding agent how to build the app. Read it fully before writing code. Follow this file over any guess. If something is missing, check section 19 (Open decisions) before inventing behavior, and list every assumption in your final summary.

---

## 1. What we are building

A live headcount board for students coming and going.

- The page lists **sessions**. A session is one counted group (for example, a class or a room). There can be several sessions, and each has its own **counter**.
- A counter is the number of students **currently present** in that session. Pressing **+ In** adds one student. Pressing **− Out** removes one.
- Each session's count is **≥ 0** with **no upper limit**. Decrementing at zero does nothing.
- Up to **200 sessions** can exist at once (`MAX_SESSIONS`).
- **Public visitors** (not logged in) can see every session and count, live. They cannot change anything.
- **Logged-in operators** can add, rename, and remove sessions, and press In and Out. Several operators can work at once, and every screen updates live.
- Each session row has a **reaction control** with a laugh (😂) and a cry (😢) option. The emoji floats up on every connected screen. Reactions are ephemeral: never stored, and they never change a count.

Privacy: the app stores **counts only**. It never stores student names or any personal data about students. Operators are staff; students are not users of this app.

Out of scope for v1: per-student tracking, multiple server instances, a history UI, email login or password reset, a mobile app, and public sign-up.

---

## 2. Roles and permissions

| Action                          | Public (anonymous) | Operator | Admin |
| ------------------------------- | :----------------: | :------: | :---: |
| View sessions and counts (live) |         ✅         |    ✅    |  ✅   |
| Press In / Out (change a count) |         ❌         |    ✅    |  ✅   |
| Add / rename / remove a session |         ❌         |    ✅    |  ✅   |
| React (😂 / 😢)                 |         ❌         |    ✅    |  ✅   |
| Create users                    |         ❌         |    ❌    |  ✅   |

Rules:

- Permissions are enforced **on the server** for every WebSocket message and every HTTP route. Hiding a button in the UI is cosmetic only.
- Admins and operators have the same session permissions. The admin role exists so someone can create operator accounts without touching the database.
- Anonymous WebSocket connections are **allowed**. They receive state and reactions. Any mutating message from them is rejected with `forbidden`.

---

## 3. Architecture overview

```
 Browser (public or operator)
   │
   ├── HTTPS  ──► Next.js (App Router)
   │               • Server Components render the page with the initial state from MongoDB
   │               • Route Handlers: POST /api/auth/login, POST /api/auth/logout, GET /api/health
   │               • Pages: /  (live board), /login
   │
   └── WSS /ws ─► Node process (custom server.ts)
                   • Wraps the Next.js request handler and adds a WebSocket server on /ws
                   • Verifies the JWT cookie during upgrade (anonymous allowed)
                   • Holds an in-memory snapshot of sessions, loaded from MongoDB at boot
                   • Runs all mutations through one serial queue
                   • Writes to MongoDB, refreshes the snapshot, broadcasts to all sockets
                             │
                             ▼
                        MongoDB (Atlas)
                          • users
                          • sessions
                          • session_log (audit, recommended)
```

Principles:

1. **The server is the single source of truth.** Clients send intents (`in`, `out`, `add`, `remove`, `rename`, `react`). They never send absolute counts.
2. **MongoDB is the durable store.** The in-memory snapshot is a read cache rebuilt from MongoDB at boot and after every change.
3. **One mutation at a time.** Every write goes through one promise queue in the Node process. This keeps the 200-session cap and position numbering safe, and keeps broadcasts ordered.
4. **Every connection gets a full snapshot on connect.** Reconnecting clients need no replay logic.
5. **Count changes are atomic in MongoDB.** One update pipeline, never read-modify-write in Node.

---

## 4. Tech stack

- **Next.js** latest stable 15.x, App Router, React 19, TypeScript in strict mode.
- **Node.js** 20 LTS or newer.
- **MongoDB** 6.0 or newer (Atlas in production). Driver: official `mongodb` package.
- **WebSockets:** `ws`, attached to a custom `server.ts`.
- **Auth:** `jose` for signing and verifying JWTs (works in Node and the Edge runtime). Passwords hashed with `argon2` (preferred) or `bcryptjs`.
- **Validation:** `zod` for HTTP bodies and WebSocket messages.
- **Styling:** CSS Modules plus `globals.css` holding the design tokens in section 9. Tailwind is optional; if used, map its theme to the same tokens.
- **Fonts:** `next/font/google` for Handjet and Press Start 2P.
- **Testing:** Vitest (unit), Vitest with a `ws` client (integration), Playwright (end-to-end).
- **Linting:** `next lint`, plus `tsc --noEmit` in CI.

Why a custom server: Route Handlers in the App Router cannot accept WebSocket upgrades. A custom `server.ts` is the standard way to run `ws` next to Next.js. It needs a host that keeps a Node process running (section 15).

---

## 5. Folder structure

```
/
├── AGENTS.md
├── server.ts                      # custom Node server: Next.js + WebSocket /ws
├── next.config.ts
├── tsconfig.json
├── .env.example
├── src/
│   ├── app/
│   │   ├── layout.tsx             # fonts, globals.css, viewport meta, body shell
│   │   ├── page.tsx               # server component: loads snapshot, renders <Board/>
│   │   ├── login/
│   │   │   └── page.tsx           # login form (client component)
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   └── logout/route.ts
│   │       └── health/route.ts
│   ├── components/
│   │   ├── Board.tsx              # client: connects to /ws, holds state, renders session cards
│   │   ├── SessionCard.tsx        # one session: name, count, In/Out, reaction group, remove
│   │   ├── AddSessionForm.tsx     # operators only
│   │   ├── ReactionLayer.tsx      # fixed overlay that spawns floating emoji
│   │   ├── ConnectionStatus.tsx   # live / reconnecting / offline indicator
│   │   └── ui/                    # Button, Panel, PixelLabel
│   ├── lib/
│   │   ├── config.ts              # reads and validates env vars (zod), fails fast
│   │   ├── db/
│   │   │   ├── client.ts          # singleton MongoClient (globalThis cache in dev)
│   │   │   ├── collections.ts     # typed accessors + index creation
│   │   │   └── users.ts           # createUser, findUserByEmail
│   │   ├── auth/
│   │   │   ├── jwt.ts             # signSession, verifySession (jose)
│   │   │   ├── password.ts        # hashPassword, verifyPassword
│   │   │   ├── cookies.ts         # cookie name, options, header parser
│   │   │   └── session.ts         # getSession() for server components and route handlers
│   │   ├── sessions/
│   │   │   ├── service.ts         # add, remove, rename, applyCountChange (all DB writes)
│   │   │   └── snapshot.ts        # in-memory snapshot + refresh from MongoDB
│   │   └── realtime/
│   │       ├── protocol.ts        # ClientMsg / ServerMsg types + zod schemas
│   │       ├── queue.ts           # serial mutation queue
│   │       ├── wsServer.ts        # attachWebSocketServer(httpServer), heartbeat
│   │       └── reactionLimiter.ts # per-socket rate limit for reactions
│   └── styles/
│       ├── globals.css            # tokens (CSS variables) and base styles
│       └── *.module.css           # per-component styles
├── scripts/
│   ├── create-user.ts             # npm run create-user -- email role
│   └── ws-smoke.ts                # connects as anonymous and operator, checks behavior
└── tests/
    ├── unit/
    ├── integration/               # ws behavior against a test MongoDB
    └── e2e/                       # Playwright, including the mobile matrix
```

Rules:

- All database writes live in `src/lib/sessions/service.ts` or `src/lib/db/users.ts`. Routes and sockets call these functions and never touch a collection directly.
- All WebSocket message handling lives in `src/lib/realtime/`. `server.ts` only wires things together.
- No secrets in client components. Only `NEXT_PUBLIC_*` variables reach the browser, and this app needs none.

---

## 6. Environment variables

`.env.example` (no real values):

```
MONGODB_URI=mongodb+srv://USER:PASS@cluster.example.mongodb.net
MONGODB_DB=session_counter
JWT_SECRET=replace-with-at-least-32-random-characters
JWT_TTL_HOURS=8
MAX_SESSIONS=200
APP_ORIGIN=http://localhost:3000
PORT=3000
NODE_ENV=development
```

`src/lib/config.ts` parses these with zod at startup and **fails fast** if a required value is missing or invalid. `JWT_SECRET` must be at least 32 characters. `APP_ORIGIN` must match exactly what browsers send (scheme and host, no trailing slash).

---

## 7. Data model (MongoDB)

### `users`

```ts
{
  _id: ObjectId,
  email: string,          // lowercased and trimmed before storage
  passwordHash: string,   // argon2 or bcrypt hash, never plain text
  role: "operator" | "admin",
  createdAt: Date,
  disabled: boolean       // default false; disabled users cannot log in
}
```

Index: unique on `email`.

### `sessions`

```ts
{
  _id: ObjectId,
  name: string,           // trimmed, 1 to 40 characters
  count: number,          // integer, >= 0, no upper limit: students currently present
  position: number,       // integer used for ordering (append = max + 1)
  createdAt: Date,
  updatedAt: Date,
  updatedBy: ObjectId | null
}
```

Index: `{ position: 1 }`.

Notes:

- `count` is an integer. Never store a fraction.
- The 200-session cap is enforced in the service layer inside the serial queue. Do not add a MongoDB validator for it.

### `session_log` (recommended)

```ts
{
  _id: ObjectId,
  sessionId: ObjectId,
  userId: ObjectId,
  action: "add" | "remove" | "rename" | "in" | "out",
  before?: number,
  after?: number,
  at: Date
}
```

One document per successful change. It answers "who changed this count and when," which matters for attendance. Reactions are not logged.

---

## 8. Authentication

### Login flow

1. `/login` shows an email and password form and posts JSON to `POST /api/auth/login`.
2. The route handler:
   - validates the body with zod,
   - finds the user by lowercased email,
   - verifies the password. When the user does not exist, still run a dummy hash verify so timing does not reveal which emails exist,
   - rejects disabled users,
   - signs a JWT with `jose`: `sub` (user id), `role`, `iat`, `exp` (`JWT_TTL_HOURS`), algorithm `HS256`,
   - sets the cookie and returns `{ ok: true }`. Never return the token in JSON.
3. Failed logins return a generic `401 { error: "invalid_credentials" }`.
4. Rate-limit login: 10 attempts per IP per 15 minutes, in memory for v1.

### Cookie

- Name `ws_session`, `httpOnly: true`, `secure: true` in production, `sameSite: "lax"`, `path: "/"`, `maxAge` equal to the JWT TTL.
- Never store the token in `localStorage`, `sessionStorage`, a URL, or a JSON body.

### Logout

`POST /api/auth/logout` clears the cookie. JWTs are stateless, so logout ends the session on that device only. For a forced logout, set `disabled: true` on the user, or add `tokenVersion` to `users` and check it in `verifySession`. Use `tokenVersion` only if asked.

### Session lookup

`getSession()` in `src/lib/auth/session.ts` reads the cookie with `next/headers`, verifies it, and returns `{ sub, role } | null`. The WebSocket upgrade calls the same `verifySession` on the parsed cookie header.

### Creating users

No sign-up page. Create accounts with `npm run create-user -- you@example.com operator`. The script prompts for the password with no echo and hashes it with argon2.

---

## 9. Design system

Sources, in order of trust:

1. **The live-site screenshot** (`Screenshot_2026-11-17_at_6_34_53_PM.png`) is the accurate visual reference for the look and feel.
2. **`DESIGN (1).md` and `SKILL (2).md`** give measured colors, fonts, and spacing from the page's CSS. Use them for exact token values.
3. **`sadok-mx.html`** is a truncated capture. Its content is cut off, the page draws its visuals on a canvas that the file cannot show, and its Content Security Policy blocks scripts and images. Do not treat it as a visual reference. Use it only to cross-check CSS values.

Use all three for **visual language only**. Do not copy the page content, artwork, or code.

### Visual direction (from the live site)

The site presents a retro handheld console on a dark star field. Build a similar feel for the board, with our own assets:

- **Background:** near-black (`--bg-0`) with sparse small white dots that drift very slowly. Draw them with a canvas or CSS gradients at low opacity. Disable the drift under `prefers-reduced-motion`.
- **Handheld frame (optional, desktop only):** a teal console shell with a dark rounded screen bezel, a red power LED with a small "POWER" label, and a D-pad and A/B buttons as decoration. Build it from CSS or inline SVG with our own colors. Sample the screenshot for the exact teal. Do not use the site's device image or any of its artwork. On phones, drop the device frame entirely (section 10A).
- **Screen content:** the board is the screen. Its contents read like a game menu: the selected item is marked with a solid triangle cursor (▶), and the list uses the pixel label font for item names or headings.
- **Header block:** top-left, a title in Handjet with a status line prefixed by a backslash, the way the site writes `\Designer`. For example, `Session Counter` then `\Live`. Top-right, a viewer status line such as `You are viewer` or `Signed in as operator`.
- **Control legend panel:** beside the screen, two uppercase pixel headings in the style of the site's "MOVE" and "BUTTONS" panels, each with boxed key caps. For operators: `IN` / `OUT` with the + and − keys, and `REACT` with the laugh and cry keys. Show this panel only on desktop and only to operators. Keyboard shortcuts are an optional extra (see section 19).
- **Decoration:** a dithered rainbow floor band in the lower right is part of the site's look. It is optional. If used, keep it low contrast and never behind text.
- **Sound toggle:** a small square button in the bottom right, shown only if the app adds sound.

### Take from the reference

Colors (keep the original CSS values; hex is an sRGB preview):

| Token          | Value                       | Use                                         |
| -------------- | --------------------------- | ------------------------------------------- |
| `--bg-0`       | `#0f1110`                   | page background                             |
| `--bg-1`       | `#171a18`                   | raised card surface                         |
| `--bg-2`       | `#232724`                   | borders, dividers                           |
| `--bone`       | `#e8e6dc`                   | primary text, counts                        |
| `--bone-dim`   | `#9a9a90`                   | secondary text, labels, icons               |
| `--sage`       | `#9fbf8e`                   | In (+) accent                               |
| `--led`        | `#e23b3b`                   | Out (−) accent, errors, offline dot         |
| `--accent`     | `#2e8b8b`                   | focus rings, links, primary action          |
| `--accent-ink` | `#1f6a6a`                   | pressed accent                              |
| `--moss`       | `#45604f`                   | hover on cards (hover-capable devices only) |
| Overlay        | `rgba(15, 17, 16, 0.78)`    | floating panels                             |
| Border alpha   | `rgba(232, 230, 220, 0.18)` | subtle divider                              |

Typography:

| Role                       | Family                                                                         | Size / line height / weight      |
| -------------------------- | ------------------------------------------------------------------------------ | -------------------------------- |
| Page heading, session name | Handjet, system-ui, sans-serif                                                 | 32px / 48px / 700                |
| Body and controls          | ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif | 16px / 24px / 400 (controls 600) |
| Labels and status          | "Press Start 2P", ui-monospace, monospace                                      | 12px / 12px / 400, uppercase     |
| Count                      | Press Start 2P or Handjet, large (see section 10A for sizing)                  | clamp(40px, 12vw, 72px)          |

Spacing and layout: spacing scale 2, 4, 6, 14, 16 px. Page gutter 16px. Layout gaps 3px, 6px, 24px.

Motion: the reference uses a 0.6s linear duration and stepped, pixel-like keyframes (`cursor-step`, `preloader-dot`). For count changes use a short `steps(4)` animation. Keep motion this small.

Visual rules:

- Dark surfaces only. Ignore the reference's light tokens (`--page`, `--paper`).
- 1px borders in `--bg-2` define cards. No drop shadows (none observed).
- Corner radius: none observed. Use `0` for cards and buttons. This is a new decision; report it.
- Pixel labels are for captions and status only. Never use them for session names or long text.

### Do not take from the reference

- The site's device artwork and any images of it, the title-screen art, the logo, and the "Sadok Cervantes" name.
- The power-on gate, preloader, and loading animation. They add delay to a page operators open all day. Skip them unless the user asks.
- The keyboard-hint overlay as a full-screen element. The idea of a legend panel is kept (see the visual direction above), but not the overlay.
- The canvas-based gamepad as an interactive control. Our controls are plain buttons.
- Any text, project names, names, or links from sadok.mx.
- The meta CSP tag (`script-src 'none'`). This app needs scripts.
- "Emerald Bold" and "Redaction 35". They are not freely available. Use the fallback stacks above.
- The `data:` images and video loop.

### States the reference does not capture

It has no captured hover, focus, active, or disabled states. Design them from the tokens and report them as new:

- **Focus:** 2px `--accent` outline with a 2px offset, on every button and input.
- **Hover:** only inside `@media (hover: hover)`. Cards shift to `--moss`; buttons brighten their border.
- **Active (press):** `--accent-ink` for accent controls, a 1px translate for buttons. This is the main tap feedback on phones.
- **Disabled:** 40% opacity, `cursor: not-allowed`, no hover change.
- **Error:** `--led` text with a written message. Never color alone.

---

## 10. Pages and components

### `/` (public board)

- `page.tsx` is a **server component**. It calls `getSnapshot()`, which reads sessions from MongoDB, and renders `<Board initial={...} />`. The first HTML already contains the counts.
- `Board` is a **client component**. It opens `ws(s)://<host>/ws`, receives the first `state` message, and renders from it.
- If a valid session cookie is present, the server passes `canEdit` into the page. The socket's `state` message also carries `canEdit`, and the UI uses it to show or hide controls. This is display only. The server re-checks every message.
- Page contents: heading, `ConnectionStatus`, the list of session cards, `AddSessionForm` (operators only), and a Log in or Log out link.

### `SessionCard`

Each card holds, top to bottom on mobile (section 10A has the full mobile layout):

1. **Name:** plain text for the public. Operators can tap it to rename (inline input, Enter saves, Escape cancels). Sends `rename`.
2. **Count:** a large number labeled "Present," with `aria-live="polite"` so screen readers announce changes.
3. **− Out** button: sends `out`. Operators only. Disabled at 0 (the server still clamps).
4. **+ In** button: sends `in`. Operators only.
5. **Reaction group:** two small buttons, 😂 and 😢. Operators only. Each sends `react` with its emoji.
6. **Remove:** small text button with a confirmation step. Operators only.

Cards are keyed by session `id` and carry `data-session-id` so the reaction layer can find them.

Public visitors see only the name and the count. Do not render disabled controls for them. Hide them.

### `ReactionLayer`

- A fixed full-viewport overlay with `pointer-events: none`, mounted once in `Board`.
- On a `react` message, it finds `[data-session-id="<id>"]`, reads the card's bounding box, and spawns a `<span class="float">` with the emoji at the card's center.
- Maximum 40 floating elements on desktop, 20 on phones. Drop the oldest when the cap is reached.
- Remove each element on `animationend`.
- Rise about 160px over about 2 seconds with `ease-out` fading to 0, plus a random horizontal offset of ±20px.
- Under `prefers-reduced-motion: reduce`, skip the rise. Show the emoji at the card for 600ms, then fade.

### `AddSessionForm`

- One name input (1 to 40 characters) and an Add button.
- Disabled when `sessions.length >= maxSessions`, with the message "Limit of 200 sessions reached." Take `maxSessions` from the server. Never hardcode it.
- Sends `add`. Clears the input after the broadcast confirms the new session, not before.

### `ConnectionStatus`

- States: `live` (`--sage` dot), `reconnecting` (`--bone-dim` dot with a stepped pulse), `offline` (`--led` dot with text).
- Reconnect with exponential backoff: 500ms, 1s, 2s, 4s, capped at 10s, with jitter. Reset on a successful open.
- While disconnected, disable all count and edit controls. Do not queue messages.

---

### Visual composition

Put the board on the dark star field from section 9. On desktop, the sessions sit in a center column that reads as the console screen, with the header block at the top-left and top-right, and the control legend beside it for operators. Keep the layout simple: one column of session cards, no grid of mini-screens.

Session cards follow the menu idea:

- The focused card (the last one tapped or the one the keyboard is on) gets a ▶ cursor and a `--accent` border.
- The session name uses the pixel label font in uppercase. The count stays in the large display font so it is the first thing read.
- Keep 1px `--bg-2` borders and no shadows, as in section 9.

The board never needs the device frame to work. It is decoration on desktop only.

---

## 10A. Mobile-first requirements

Phones are the main device. Operators press buttons standing up, and visitors watch on their own phones. Build mobile first and enhance upward. Every rule here is required.

### Layout

- Base CSS targets 360px wide. Add `@media (min-width: …)` rules for larger screens. Never start from desktop and shrink.
- Mobile session card (full-width):
  - Line 1: session name, one line, ellipsis when long (full name in `title` and `aria-label`).
  - Line 2: count in large type, centered, with − Out on the left and + In on the right at the same height as the count.
  - Line 3: 😂 and 😢, and on operator views the remove button, aligned right.
- Desktop (≥ 768px): the same content in one horizontal row.
- On phones, no device frame and no control legend. Keep the star field and the ▶ menu cursor, which fit small screens well.
- Cards are full width with 16px page gutters and 8px to 12px gaps.
- Test landscape phones too (667 × 375, 844 × 390). Nothing cut off, no sideways scrolling, and the header takes no more than about a third of the height.
- Use `100dvh`, not `100vh`, for full-height layouts.
- Respect notches and home indicators: `env(safe-area-inset-*)` padding on the root layout, with `viewport-fit=cover` in the viewport meta tag.

### Touch targets and controls

- Every button, link, and toggle is at least **44 × 44 CSS px** (WCAG 2.5.5). The In and Out buttons should be about **64 × 56 px**.
- At least **8px** between adjacent targets.
- The most-used controls (In and Out) sit in the lower half of the card, where a thumb reaches easily.
- `touch-action: manipulation` on all buttons, to remove the tap delay and double-tap zoom.
- `user-select: none` on the count and the buttons, so long presses do not select text or show a callout. Set `-webkit-tap-highlight-color: transparent` and provide a clear `:active` state instead.
- Hover styles only inside `@media (hover: hover)`.
- Press feedback of 50ms to 100ms on every button.
- Optional: `navigator.vibrate(10)` on a successful In or Out where supported. iOS Safari ignores it, so check that the function exists.

### Typography and inputs

- Body text at least **16px**. Inputs at least **16px**, or iOS Safari zooms the page on focus.
- Counts use `clamp()` so they stay large on small screens.
- Never disable pinch zoom. No `maximum-scale=1` or `user-scalable=no`.
- Name input: `maxlength="40"`, `autocomplete="off"`, `enterkeyhint="done"`, 48px high or taller.
- Login email: `type="email"`, `inputmode="email"`, `autocomplete="email"`, `autocapitalize="none"`, `spellcheck="false"`.
- Login password: `type="password"`, `autocomplete="current-password"`.
- The login form is one column, labels above fields, full-width 48px submit button.

### Keyboard and add form

- The focused input must stay visible when the on-screen keyboard opens. Do not use fixed-bottom inputs.
- The Add form sits at the top of the page, not sticky, to avoid keyboard overlap.
- After a session is added, scroll its card into view with `scrollIntoView({ block: "nearest" })`.

### Reactions on small screens

- Emoji rise from the card. If the card is near the top of the screen, the emoji fades out early. This is acceptable. Do not clamp to the screen edge.
- Use the 20-element cap on phones (section 10).

### Performance on phones

- Budget: the public page's first-load JavaScript under about **150 KB gzipped**. No charting or animation libraries. Reactions use CSS keyframes.
- `next/font` with `display: "swap"` for both fonts, subset to the characters used.
- Up to 200 cards: wrap `SessionCard` in `React.memo` keyed by session id. Apply `content-visibility: auto` with `contain-intrinsic-size` of about 120px to cards.
- A single count change re-renders only that card.

### Connection on mobile

Mobile networks drop sockets silently, and phones suspend background tabs.

- **Server heartbeat:** ping every 25 seconds. Terminate any socket that has not answered the previous ping. Put this in `wsServer.ts`.
- **Client heartbeat:** if no message (state, react, or pong) arrives for 45 seconds, close and reconnect.
- **Foreground check:** on `visibilitychange` to visible, and on the `online` event, check the socket and reconnect immediately if it is not open. Do not wait out the backoff timer.
- While reconnecting, disable In and Out. Show the status in text, not color alone.

### Visual and system settings

- Dark only. Set `color-scheme: dark` on `:root`, and `<meta name="theme-color" content="#0f1110">`.
- `-webkit-text-size-adjust: 100%` on `html`.
- `overscroll-behavior-y: none` on the body only if pull-to-refresh fights the live list. Otherwise leave it on.

### Mobile test matrix

Run the Playwright end-to-end suite on these emulated devices:

- iPhone SE (375 × 667), WebKit
- 360 × 800 Android profile, Chromium
- iPhone 14 (390 × 844), WebKit
- Landscape 844 × 390, WebKit
- A 320px-wide edge case, to catch overflow

Each device must show: no horizontal scroll, every control at least 44px, text readable without zooming, a login-to-In flow that completes, and a reaction that is visible.

Also run one manual check on a real phone over cellular data. The live count must update within two seconds.

---

## 11. Realtime protocol

### Messages

Client to server (`src/lib/realtime/protocol.ts`):

```ts
type ClientMsg =
  | { type: "add"; name: string }
  | { type: "remove"; id: string }
  | { type: "rename"; id: string; name: string }
  | { type: "in"; id: string } // count + 1
  | { type: "out"; id: string } // count - 1, never below 0
  | { type: "react"; id: string; emoji: "😂" | "😢" };
```

Server to client:

```ts
type ServerMsg =
  | {
      type: "state";
      sessions: SessionDTO[];
      maxSessions: number;
      canEdit: boolean;
    }
  | { type: "react"; id: string; emoji: "😂" | "😢" }
  | { type: "error"; code: ErrorCode; message: string };

type SessionDTO = { id: string; name: string; count: number; position: number };
type ErrorCode =
  | "bad_request"
  | "forbidden"
  | "not_found"
  | "limit_reached"
  | "rate_limited"
  | "server_error";
```

Rules:

- Parse every incoming message with zod. Bad JSON or a bad shape gets `error: bad_request`, and the socket stays open.
- `id` values are ObjectId strings, validated with `ObjectId.isValid` before any query. Unknown ids get `not_found`.
- `name` is trimmed and must be 1 to 40 characters.
- `in` and `out` change the count by exactly one. There is no `delta` field, so no other amount can be sent.
- `react` requires an operator or admin. It is limited to one reaction per socket every 300ms. Excess reactions get `rate_limited`, so the client can show feedback.

### Server flow

1. **Upgrade** (`wsServer.ts`):
   - If the path is not `/ws`, return without touching the socket. Next.js dev uses its own upgrade handler for HMR, and must keep working.
   - If the request carries a session cookie and an `Origin` header that does not match `APP_ORIGIN`, reject with `403`. Anonymous connections are allowed from any origin because they are read-only and show public counts.
   - Verify the cookie if present. A missing or invalid cookie means anonymous, not rejected.
   - Call `wss.handleUpgrade`, then emit `connection` with the session or `null`.
2. **Connection:** send `state` immediately with `canEdit = session !== null`.
3. **Message:** parse, check permission, then:
   - `react`: check the limiter, confirm the session exists in the snapshot, and broadcast `react` to all sockets. No state change and no state broadcast.
   - `add`, `remove`, `rename`, `in`, `out`: run through `enqueue(() => service.apply(...))`.
4. **Mutation (inside the queue):**
   - Validate against the current snapshot (for example, `sessions.length < MAX_SESSIONS` for `add`).
   - Run the single atomic write (section 12).
   - Write the `session_log` entry if enabled.
   - Refresh the snapshot from MongoDB.
   - Broadcast `state` to all sockets.
   - On error, send `error` only to the sender, log it server side, and broadcast nothing.
5. **Close:** remove the socket from the set.

### Broadcast

Broadcast the full state after each successful change. With at most 200 sessions the payload is small. `canEdit` differs per socket, so send each socket its own `state` message, or keep `canEdit` out of the broadcast and send a separate `session` message on connect. Choose one approach and document it in `protocol.ts`.

### Client reconnect

Every connect receives a full `state`, and the client replaces its local state with it. There is no replay and no sequence number in v1.

---

## 12. Mutations and MongoDB

### Serial queue

`src/lib/realtime/queue.ts`:

```ts
let chain: Promise<unknown> = Promise.resolve();
export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}
```

Every mutation runs through `enqueue`. This is what makes the cap check and position numbering safe.

### Atomic count change

Never read the count into Node, change it, and write it back. Use one update pipeline. `in` uses `+1` and `out` uses `-1`:

```ts
const delta = action === "in" ? 1 : -1;
const before = await sessions.findOne({ _id });
if (!before) throw notFound();

const res = await sessions.findOneAndUpdate(
  { _id },
  [
    {
      $set: {
        count: { $max: [0, { $add: ["$count", delta] }] },
        updatedAt: "$$NOW",
        updatedBy: new ObjectId(userId),
      },
    },
  ],
  { returnDocument: "after" },
);
```

Requires MongoDB 4.2 or newer. For the log, `before` is the count read just before the update. Because mutations are serialized in this process, that read is safe. Use `res.count` as the `after` value.

### Add

Inside the queue: `countDocuments()`; if it is `>= MAX_SESSIONS`, return `limit_reached`. Position is `max(position) + 1`, or 0 when empty. Insert with `count: 0`, timestamps, and `updatedBy`.

### Remove

Delete by id. If nothing was deleted, return `not_found`. Do not renumber positions; gaps are fine.

### Rename

`updateOne` with `$set: { name, updatedAt, updatedBy }`, after validating the name.

### Startup

1. Load and validate config. Fail fast on bad values.
2. Connect to MongoDB and create indexes (`users.email` unique, `sessions.position`).
3. Load the snapshot.
4. Start the HTTP server with Next.js and attach the WebSocket server.

---

## 13. Security checklist

Every item is required.

- [ ] Passwords hashed with argon2 or bcrypt; never logged or returned.
- [ ] JWT signed with HS256 using a `JWT_SECRET` of at least 32 characters. `jwtVerify` pins `algorithms: ["HS256"]`.
- [ ] Cookie is `httpOnly`, `secure` in production, `sameSite: "lax"`.
- [ ] No token in `localStorage`, `sessionStorage`, URLs, or JSON bodies.
- [ ] Login rate-limited; generic error messages; timing-safe handling of unknown emails.
- [ ] Every WebSocket mutation re-checks the role on the server.
- [ ] Origin check on upgrades that carry a session cookie.
- [ ] Every WebSocket message validated with zod; malformed input never crashes the process.
- [ ] Payload size limit on the WebSocket server (`maxPayload: 4096`).
- [ ] MongoDB queries use typed `ObjectId`s; no raw user strings as operators or field names.
- [ ] Security headers: a Content-Security-Policy that allows same-origin scripts and `ws:`/`wss:` to the app origin, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`.
- [ ] React escapes all text. No `dangerouslySetInnerHTML`.
- [ ] `.env` is git-ignored. `.env.example` contains no real values.

---

## 14. Error handling and edge cases

- **Removing a session while someone presses In.** The `in` arrives after the delete. The server returns `not_found` to the sender. The client drops the card on the next `state` and must not crash on a missing card.
- **Two operators press In at the same moment.** The queue runs them in order, and each atomic update applies. Both see the final count in the next broadcast.
- **199 sessions, two operators add at once.** The queue serializes them, so the second add sees 200 and gets `limit_reached`.
- **Out pressed at zero.** The server clamps at 0 and broadcasts the unchanged state. The UI disables the button at 0.
- **MongoDB unreachable.** Changes return `server_error`. Reads from the snapshot still work. The health route reports `degraded`.
- **WebSocket drops.** Show `reconnecting`, disable controls, reconnect with backoff, and receive the full state on reconnect.
- **Server restart.** Clients reconnect and get the snapshot from MongoDB. In-flight reactions are lost, which is acceptable.
- **Very long or empty names.** Rejected by the schema and the UI.
- **Large counts.** Counts have no upper limit. Format them with `Intl.NumberFormat` for display only. Store and send plain integers.
- **Multiple tabs for one operator.** Each tab is a socket and receives all broadcasts. No special handling needed.
- **Expired JWT with the page open.** The socket stays open, so an operator could keep editing after the token expires. On connect, set a timer for the token's `exp`. When it fires, close the socket and show "Session expired, log in again."

---

## 15. Running, building, and deploying

### Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "tsx watch server.ts",
    "build": "next build",
    "start": "NODE_ENV=production tsx server.ts",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "create-user": "tsx scripts/create-user.ts",
    "ws:smoke": "tsx scripts/ws-smoke.ts"
  }
}
```

`server.ts` creates the Next.js app, calls `app.prepare()` before listening, and forwards every HTTP request to `app.getRequestHandler()`.

### Hosting

- Use a host that keeps a Node process running: Render, Railway, or Fly.io. Serverless functions such as Vercel's cannot hold WebSocket connections, so live updates would fail there.
- Deploy with `next build`, then `npm start`.
- Use MongoDB Atlas. Allow the host's network, and restrict access once it works.
- Serve over HTTPS. The client uses `wss:` when the page is on `https:`.
- Set `APP_ORIGIN` to the public URL.
- One instance is the supported setup in v1. Do not scale horizontally until a change stream or Redis relay exists.

### Health check

`GET /api/health` returns `{ status: "ok", db: "ok" | "down", connections: number }`. It must not expose configuration.

---

## 16. Testing

- **Unit (Vitest):**
  - zod schemas accept valid messages and reject bad ones: wrong types, empty or over-long names, malformed ids, and any message that tries to pass an amount.
  - The serial queue runs tasks in order and keeps going after a failure.
  - The reaction limiter allows one reaction per 300ms per socket.
  - JWT round trip; expired token rejected; wrong algorithm rejected.
- **Integration (Vitest, `ws`, and a test MongoDB such as `mongodb-memory-server`):**
  - Anonymous socket receives `state` with `canEdit: false`. Sending `in` gets `forbidden`.
  - Operator `in` and `out` update the count and broadcast to every socket.
  - Count clamps at zero.
  - 200 adds succeed; the 201st returns `limit_reached`.
  - Two operators each send 50 `in` messages: the final count is exactly 100, with no lost updates.
  - Reaction from an operator reaches anonymous sockets; reaction from an anonymous socket is rejected.
  - Invalid JSON does not crash the server.
  - Removing a session, then sending `in` for it, returns `not_found`.
- **End-to-end (Playwright):**
  - Public visitor sees the sessions and counts, with no In, Out, reaction, remove, or add controls.
  - Operator logs in, presses In, and sees the count change in a second, separate browser context.
  - A reaction appears in the second context and disappears after the animation.
  - Logout returns the page to public view.
- **Mobile end-to-end:** run the flows above on every device in the section 10A matrix. A failure on any device fails the build.
- **Manual smoke:** `npm run ws:smoke` connects as anonymous and as an operator, sends one of each message, and prints the results.

Every mutation needs at least one integration test.

---

## 17. Build order

Complete each phase and pass its checks before starting the next.

1. **Scaffold.** Next.js app (App Router, TypeScript, ESLint). Add `server.ts`, `config.ts`, `.env.example`. Check: `npm run dev` serves the home page through the custom server.
2. **Database.** `client.ts`, `collections.ts` with indexes, `users.ts`. Check: indexes exist after startup, and `create-user` stores a hashed password.
3. **Auth.** Password, JWT, and cookie helpers; login and logout routes; `/login` page. Check: valid login sets the cookie, wrong password returns 401, `getSession()` returns the right role, cookie is `httpOnly`.
4. **Sessions service and snapshot.** `service.ts`, `snapshot.ts`, `queue.ts`. Check: unit tests for the queue and the clamp, integration test for the 200 cap.
5. **Realtime server.** `protocol.ts`, `wsServer.ts` with heartbeat, `reactionLimiter.ts`, attached in `server.ts`. Check: anonymous socket gets state; origin rules work; bad messages do not crash; `ws:smoke` passes.
6. **Public board.** `page.tsx`, `Board`, view-only `SessionCard`, `ConnectionStatus`, `globals.css` tokens, fonts. Build the mobile layout first (section 10A). Check: live counts with no controls when logged out; reconnect works after a server restart; mobile checks pass at 360px and in landscape.
7. **Operator controls.** In, Out, rename, remove, `AddSessionForm` with the limit message. Check: changes appear on the public board in real time; anonymous messages are rejected.
8. **Reactions.** Reaction buttons, `ReactionLayer`, float animation, reduced motion. Check: reactions appear on other screens, are not stored, and do not change counts.
9. **Hardening.** Security headers, token-expiry socket close, `session_log`, health route, error states. Check: section 13 complete.
10. **Tests and deploy.** Full suite green, `npm run build` passes, deploy to a long-running Node host, and confirm `wss://` works from a phone on cellular data.

---

## 18. Definition of done

- [ ] A public visitor sees every session's live count and reactions, and cannot change anything.
- [ ] A logged-in operator can add, rename, and remove sessions, and press In and Out.
- [ ] Two operators changing the same session at once produce a correct final count.
- [ ] Up to 200 sessions can exist; the 201st is refused with a visible message.
- [ ] Counts never go below zero and have no upper limit.
- [ ] Laugh and cry reactions float up on every connected screen and are never stored.
- [ ] No student names or other personal data are stored.
- [ ] A dropped connection reconnects and shows current counts without a page reload.
- [ ] The app runs on one Node process with MongoDB as durable storage, and survives a restart without losing data.
- [ ] On a 360px phone, in portrait and landscape, every control is at least 44px, nothing scrolls sideways, and text is readable without zooming.
- [ ] Connections recover after a phone locks or switches networks, with live counts back within two seconds of returning to the app.
- [ ] Public first-load JavaScript is under about 150 KB gzipped.
- [ ] All tests pass, the build succeeds, and the security checklist is complete.
- [ ] The board matches the look in section 9's visual direction: dark star field, pixel menu cursor, and the header and legend blocks on desktop. None of the site's artwork is copied.
- [ ] The UI follows section 9's tokens, and the summary lists every state designed as new.

---

## 19. Open decisions

Not settled in the requirements. Use the default unless the user changes it, and state the choice in the final summary.

1. **Reactions for public visitors.** Default: **logged-in only**. Change the `react` check to open them to everyone.
2. **Who can add and remove sessions.** Default: **operators and admins**. Restrict to admin by changing one permission check.
3. **Session name length.** Default: **1 to 40 characters**.
4. **Reactions in an attendance app.** The laugh and cry buttons were requested earlier. Confirm they should stay, since they do not relate to counting students.
5. **Daily reset.** Counts currently persist until changed. Decide whether counts should reset at the start of each day or each session period, and whether old sessions should be archived.
6. **Button labels.** Default: **+ In** and **− Out**. Confirm the wording.
7. **Session length.** Default: **8 hours**, from `JWT_TTL_HOURS`.
8. **Single instance.** Default: **one Node process**. Add change streams or Redis only when needed.
9. **Handheld frame.** Default: **desktop only, built from our own CSS/SVG**. Confirm whether the console frame should appear at all, since it adds visual weight.
10. **Keyboard shortcuts for operators.** Default: **none in v1**. The legend is a visual nod to the site. Adding keys such as + and − for In and Out would make a desktop operator faster; confirm if wanted.
11. **Star field and floor.** Default: **star field on, rainbow floor off**. Confirm which decoration the user wants.

When the agent finishes, its summary must list: the decisions above with the values chosen, every design state it had to invent (section 9), and any deviation from this file with the reason.
