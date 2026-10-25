# viato

A [Spectrum](https://photon.codes/docs/spectrum-ts) project. Wired with: imessage.

## Environment

Before running, open `.env` and fill in the values:

From your project Settings on the [Photon dashboard](https://app.photon.codes):

- `PROJECT_ID`
- `PROJECT_SECRET`
- `GEMINI_API_KEY`

For live Google Flights search, add `SERPAPI_API_KEY` from SerpApi. The agent searches for a direct one-way flight and asks you to reply exactly `APPROVE` before sending its flight number, date, and airport codes to Django. Django verifies the flight with AeroDataBox and makes the returned details available to the dashboard. Set `DJANGO_API_URL` if Django is not at `http://127.0.0.1:8000`, and set `DJANGO_API_TOKEN` to the same long random value configured in `travel-agent-backend/.env`. Django runs no AI agent; it only receives and handles the authenticated API request.

## Run

```sh
bun install
bun start
```

To add phone numbers to the first supported iMessage group chat that messages the agent after startup, pass comma-separated E.164 numbers:

```sh
bun run start -- --add-members +15551234567,+15557654321
```

The member flag is one-shot. Direct messages are skipped because iMessage cannot add members to a DM. The same option is available through the repo launchers: `bash ./start-app.sh --add-members +15551234567,+15557654321` or `./start-app.ps1 -AddMembers "+15551234567,+15557654321"`.

## Where to go next

- [Spectrum docs](https://photon.codes/docs/spectrum-ts)
- Edit `src/index.ts` to replace the echo loop with real agent logic.
- Add more providers from `spectrum-ts/providers/*`.

To try the flight flow, ask Gemini to search a route and date, for example: `Find a one-way flight from JFK to MCO on 2026-11-02.` If a route, airport, or date is unclear, Gemini should ask a follow-up. After it presents a direct flight, reply `APPROVE` to send it to Django, or `CANCEL` to discard it. Tool calls are logged in the app terminal as `[TOOL CALLED] searchFlights(...)`.

The server keeps temporary conversation history in memory: up to 20 messages per chat and 100 chats. It is cleared whenever the app restarts, and it is not shared between server instances.

Gemini uses `gemini-3.8-flash` with low thinking effort and a 512-token response cap. It sends up to the latest 10 user/assistant exchanges to keep prompts bounded. Token use is logged per turn as `[GEMINI USAGE]`; check Google's current pricing for the billed rate. Flight searches also use SerpApi and have separate usage limits and billing.
