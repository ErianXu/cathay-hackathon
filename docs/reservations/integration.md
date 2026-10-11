# Integrating the reservation backend

## Current repository

`index.html` loads `app.js` as a classic browser script. `app.js` also exports `parseTypes`, `planActivities`, and `voiceErrorMessage` through CommonJS for the existing Node tests. The new backend follows CommonJS; changing the root package to `"type": "module"` would break those `require()` calls and needs a coordinated migration.

The current frontend stores an array under `cathay-concierge-prototype-v1` in `localStorage`:

```js
{ id, type, start, end, venue, status }
```

Its statuses are `pending`, `confirmed`, and `none`. Its IDs identify browser activities, not database rows. `#bookingButton` currently changes every pending activity to confirmed locally. The default shower confirmation is also simulated. There is no server request, availability check, hold, waitlist, or ownership check behind those labels.

At the start of this backend work the repository had no `server.js`, `.gitignore`, or `package.json`, and no DeepSeek integration, `confirmMassage`, or `renderServices` function. The standalone demo server is a new entry point, not an extension of an existing main server. The original UI remains unchanged.

## Frontend migration, future work

Keep itinerary activities and reservation records separate. An activity needs its own local ID plus optional `slotId`, `reservationId`, and `waitlistEntryId`; these database IDs must come from API results. Keep `gate` and the existing flight/gate display in the itinerary only.

1. Fetch the lounge/service catalog and slots for the selected airport-local date. Render the backend rule's bookability and availability rather than inferring them from `TYPES[type].reservable`.
2. Before booking, display the specific slot, lounge, time, and action for user confirmation. Generate and retain an idempotency key for that attempt. Reuse it after an ambiguous network failure; use a new key for a different operation.
3. Replace the bulk local status flip with a request for each explicitly approved slot. Store returned reservation IDs and refresh availability. A locally planned activity is not a confirmed reservation.
4. On a full slot, show a distinct join-waitlist action. Track `waiting`, `offered`, `accepted`, `cancelled`, and `expired` separately. An offered entry is a time-limited hold, not confirmation; accepting it returns the reservation record.
5. Cancelling an activity with a confirmed reservation must first cancel the server record. Removing a local itinerary row alone does not release capacity. Use the replacement endpoint to change a booked slot atomically instead of cancel-then-book.
6. On reload, fetch the user's server reservations and waitlist entries. Persist only itinerary preferences in `localStorage`; derive booking state from the server. Expired/cancelled records remain historical records and must not render as confirmed.

Availability can change between rendering and mutation. A conflict response should trigger a refresh and a clear choice, not an optimistic confirmed badge. A hold's `offer_expires_at` is UTC; convert it for display without treating an airport-local slot time as UTC. Existing `start`/`end` values have no date or offset, so integration must add the chosen slot date and lounge timezone. The current service does not reject past slots or check boarding feasibility; integrate those itinerary checks separately.

## Identity and server mounting

The demo server binds to loopback and accepts `X-Demo-User-Id` as its caller identity. It is intended for controlled local demonstrations. The adapter itself checks the loopback client, Host, and any Origin; a frontend opened as `file://` or served on a different development-server port is currently rejected. Serving the future UI from the same loopback server is the simplest local integration.

A deployed server needs a separate authenticated transport: resolve the user from a trusted session and pass that ID to the service, rather than accepting client-selected identity. The current adapter's local-only transport guards and demo header handling must be replaced as part of that work; mounting it alone does not create a public authenticated API.

The reservation API adapter can be mounted before a future native Node HTTP server's existing route handler. It returns `false` for paths it does not handle, so those requests can continue to the existing handler. Handled routes return JSON; a recognized route with the wrong method returns 405. See [api.md](api.md) for the exact constructor and route contracts.

```js
const { createReservationApi } = require('./backend/reservation-api.js');
const reservationApi = createReservationApi({ service });

// Inside the future server's async request handler:
if (await reservationApi(req, res)) return;
// Continue to that server's existing routing code.
```

The adapter is asynchronous only while reading HTTP bodies; it calls the synchronous service after the full input is parsed. Do not hold a database transaction while receiving request bytes.

Use an explicit absolute database path when integrating into another entry point. Resolve paths from the module/repository location rather than whichever directory launched the process. Both processes must access the same database file to share capacity; separate files create separate inventories.

Check integration points before mounting:

| Area | Current state | Required coordinated change |
| --- | --- | --- |
| Main server | No existing `server.js` in the original checkout | Mount the adapter into the real server when one exists; avoid two listeners on the same port |
| Modules | Browser classic script plus CommonJS tests/backend | Preserve the root CommonJS setting or migrate callers together |
| Package scripts | Backend adds `test`, `db:init`, `demo:reservations`, `reservations:server` | Merge scripts/dependencies with other work instead of replacing their package file |
| Frontend globals | `TYPES`, `clock`, `activities`, `render` in `app.js` | Keep backend `clock` injection and modules out of the browser global scope |
| Persistence | Browser activity IDs and simulated statuses | Add server IDs and explicit reservation/waitlist rendering; no direct localStorage-to-DB import |
| DeepSeek/tool orchestration | Absent | Add orchestration outside transactions, preserving trusted approval and deterministic service checks |

## Agent boundary

The model-facing tool object provides reads and mutation proposals. It does not expose the approval/commit function. Present each proposal in trusted UI, obtain explicit approval for that specific action, then call `approveProposal` from the trusted application layer. The approval path rechecks availability, eligibility, ownership, and proposal expiry.

An instruction in a conversation, tool argument, or generated JSON is not a trusted approval signal by itself. Do not expose approval as a model tool or let a model send SQL. Keep LLM/network work outside `BEGIN IMMEDIATE`; the service functions and database transactions remain synchronous.

## SQLite operating assumptions

Use one local database file on a writable filesystem. WAL supports multiple processes on the same host and concurrent readers, but retains one writer and cannot coordinate across a network filesystem. Keep write transactions short and let the busy timeout produce a retryable failure when contention persists. [SQLite transaction semantics](https://www.sqlite.org/lang_transaction.html), [SQLite WAL operating constraints](https://www.sqlite.org/wal.html)

WAL files are part of live database state: do not copy a live `.db` alone or delete its `-wal`/`-shm` companions to reset it. Use SQLite's backup mechanism or close all connections before handling a complete database snapshot. Reads reflect expired deadlines without writing; mutations and explicit offer maintenance persist expiration and promote the queue. A continuously running expiration worker is not part of this prototype.
