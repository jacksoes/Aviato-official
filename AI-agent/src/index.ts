import { Spectrum } from "spectrum-ts";
import { imessage } from "@spectrum-ts/imessage";
import { GoogleGenAI, ThinkingLevel, Type, type FunctionDeclaration } from "@google/genai";

const toolDeclarations: FunctionDeclaration[] = [{
  name: "verify_tool",
  description: "A demo tool that proves Gemini can call an app tool. Use it when the user asks to test, verify, or use the tool. Echo their phrase in the result.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      phrase: { type: Type.STRING, description: "A short phrase supplied by the user to echo back." },
    },
    required: ["phrase"],
  },
}, {
  name: "searchFlights",
  description: "Search live Google Flights for a direct one-way flight. Call only after you know the departure airport, arrival airport, and travel date. Ask a follow-up if any are missing or ambiguous. Use three-letter IATA airport codes. The user must explicitly reply APPROVE before the selected flight is sent to Django.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING, description: "Three-letter IATA departure airport code, for example JFK." },
      destination: { type: Type.STRING, description: "Three-letter IATA arrival airport code, for example MCO." },
      outboundDate: { type: Type.STRING, description: "Departure date in YYYY-MM-DD format." },
      departureWindow: { type: Type.STRING, enum: ["morning", "afternoon", "evening", "any"], description: "Requested local departure time window. Morning is before noon; afternoon is noon to 6 PM; evening is 6 PM to midnight." },
    },
    required: ["origin", "destination", "outboundDate"],
  },
}, {
  name: "saveDestination",
  description: "Save the user's stated travel destination to the Django travel dashboard. Call only when the user clearly says where they plan to travel; this requires no approval. Do not save places they are merely considering hypothetically or asking about for someone else.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      destination: { type: Type.STRING, description: "The city, region, or destination the user said they plan to travel to." },
    },
    required: ["destination"],
  },
}];

type ChatTurn = { role: "user" | "assistant"; text: string };
type ApprovedFlight = { flightNumber: string; date: string; departure: string; arrival: string };
const chatMemory = new Map<string, ChatTurn[]>();
const pendingFlights = new Map<string, { flight: ApprovedFlight; expiresAt: number }>();
const MAX_TURNS_PER_CHAT = 10;
const MAX_CHATS_IN_MEMORY = 100;

function rememberTurn(chatId: string, turn: ChatTurn): void {
  const turns = chatMemory.get(chatId) ?? [];
  turns.push(turn);
  if (turns.length > MAX_TURNS_PER_CHAT * 2) turns.splice(0, turns.length - MAX_TURNS_PER_CHAT * 2);

  // Map insertion order lets the oldest inactive chat be evicted first.
  chatMemory.delete(chatId);
  chatMemory.set(chatId, turns);
  if (chatMemory.size > MAX_CHATS_IN_MEMORY) {
    const oldestChat = chatMemory.keys().next().value;
    if (oldestChat) chatMemory.delete(oldestChat);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStartupMembers(args: string[]): string[] {
  const members: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    let value: string | undefined;
    if (argument === "--add-members") {
      const values: string[] = [];
      while (index + 1 < args.length && !args[index + 1].startsWith("--")) {
        values.push(args[index + 1]);
        index += 1;
      }
      if (values.length === 0) throw new Error("--add-members requires E.164 phone numbers.");
      members.push(...values.flatMap((entry) => entry.split(",")).map((member) => member.trim()).filter(Boolean));
      continue;
    } else if (argument.startsWith("--add-members=")) {
      value = argument.slice("--add-members=".length);
    } else {
      throw new Error(`Unknown startup option: ${argument}. Supported option: --add-members +15551234567,+15557654321`);
    }
    if (!value) throw new Error("--add-members requires a comma-separated list of E.164 phone numbers.");
    members.push(...value.split(",").map((member) => member.trim()).filter(Boolean));
  }

  const uniqueMembers = [...new Set(members)];
  const invalidMember = uniqueMembers.find((member) => !/^\+[1-9]\d{7,14}$/.test(member));
  if (invalidMember) throw new Error("--add-members accepts E.164 numbers only, such as +15551234567.");
  return uniqueMembers;
}

let pendingGroupMembers = parseStartupMembers(process.argv.slice(2));
let reportedNoGroupYet = false;

async function searchFlights(origin: string, destination: string, outboundDate: string, departureWindow: string): Promise<{ message: string; flight?: ApprovedFlight }> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return { message: "Flight search is not configured. Set SERPAPI_API_KEY to a SerpApi key." };
  }

  try {
    const departure = origin.trim().toUpperCase();
    const arrival = destination.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(departure) || !/^[A-Z]{3}$/.test(arrival)) {
      return { message: "Please provide a departure and destination airport using three-letter IATA codes." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(outboundDate)) {
      return { message: "Please provide the travel date in YYYY-MM-DD format." };
    }

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_flights");
    url.searchParams.set("departure_id", departure);
    url.searchParams.set("arrival_id", arrival);
    url.searchParams.set("outbound_date", outboundDate);
    url.searchParams.set("type", "2"); // one-way
    const outboundTimes: Record<string, string> = {
      morning: "0,11",
      afternoon: "12,17",
      evening: "18,23",
    };
    if (outboundTimes[departureWindow]) url.searchParams.set("outbound_times", outboundTimes[departureWindow]);
    url.searchParams.set("currency", "USD");
    url.searchParams.set("hl", "en");
    url.searchParams.set("gl", "us");
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const body = await response.text();
    let result: unknown;
    try {
      result = JSON.parse(body);
    } catch {
      return { message: `Google Flights search failed with HTTP ${response.status}.` };
    }

    if (!response.ok || !isRecord(result)) {
      return { message: `Google Flights search failed with HTTP ${response.status}.` };
    }

    if (typeof result.error === "string") return { message: `Google Flights search failed: ${result.error}` };

    const bestFlights = Array.isArray(result.best_flights) ? result.best_flights : [];
    const otherFlights = Array.isArray(result.other_flights) ? result.other_flights : [];
    const itineraries = [...bestFlights, ...otherFlights].filter(isRecord);
    const itinerary = itineraries.find((item) => Array.isArray(item.flights) && item.flights.length === 1);
    if (!itinerary || !Array.isArray(itinerary.flights) || itinerary.flights.length !== 1) {
      return { message: "No direct matching flight was found for that route and date. Try another date or route." };
    }

    const segment = itinerary.flights[0];
    if (!isRecord(segment) || typeof segment.flight_number !== "string") {
      return { message: "The flight result did not include a usable flight number. Please try another search." };
    }
    const departureAirport = isRecord(segment.departure_airport) ? segment.departure_airport : {};
    const arrivalAirport = isRecord(segment.arrival_airport) ? segment.arrival_airport : {};
    const flightNumber = segment.flight_number.trim().toUpperCase();
    const airline = typeof segment.airline === "string" ? segment.airline : "Airline unavailable";
    const from = typeof departureAirport.id === "string" ? departureAirport.id : departure;
    const to = typeof arrivalAirport.id === "string" ? arrivalAirport.id : arrival;
    const departTime = typeof departureAirport.time === "string" ? departureAirport.time : "time unavailable";
    const arriveTime = typeof arrivalAirport.time === "string" ? arrivalAirport.time : "time unavailable";

    const price = typeof itinerary.price === "number" ? `Price shown: $${itinerary.price} USD.` : "Price unavailable.";
    const totalDuration = typeof itinerary.total_duration === "number" ? `Total duration: ${itinerary.total_duration} minutes.` : "";
    const metadata = isRecord(result.search_metadata) ? result.search_metadata : {};
    const flightsUrl = typeof metadata.google_flights_url === "string" ? metadata.google_flights_url : "";
    const approvedFlight = { flightNumber, date: outboundDate, departure: from.toUpperCase(), arrival: to.toUpperCase() };
    return {
      flight: approvedFlight,
      message: [
        "I found this direct flight (not booked):",
        `${airline} ${flightNumber}: ${from} ${departTime} → ${to} ${arriveTime} on ${outboundDate}.`,
        price,
        totalDuration,
        flightsUrl,
        "If you want this flight added to your travel dashboard, reply exactly APPROVE. I will then ask Django to verify it with AeroDataBox. Reply CANCEL to discard it.",
      ].filter(Boolean).join("\n"),
    };
  } catch (error) {
    return { message: `Could not reach Google Flights search: ${String(error)}` };
  }
}

const GEMINI_MODEL = "gemini-3.8-flash";
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) throw new Error("GEMINI_API_KEY is required to start the agent.");
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

async function submitApprovedFlight(flight: ApprovedFlight): Promise<string> {
  const baseUrl = (process.env.DJANGO_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const token = process.env.DJANGO_API_TOKEN?.trim();
  if (!token) return "I couldn't send the approved flight because DJANGO_API_TOKEN is missing from AI-agent/.env. Set the same token in travel-agent-backend/.env, then restart the TypeScript server and Django.";

  try {
    const response = await fetch(`${baseUrl}/api/agent/flights/approve/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Token": token },
      body: JSON.stringify(flight),
      signal: AbortSignal.timeout(20_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isRecord(payload)) {
      const error = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Django returned HTTP ${response.status}.`;
      return `Django could not verify the approved flight: ${error}`;
    }
    const details = isRecord(payload.flight) ? payload.flight : undefined;
    if (!details) return "Django accepted the request but did not return flight details.";
    const airline = typeof details.airline === "string" ? details.airline : "Airline unavailable";
    const flightNumber = typeof details.flightNumber === "string" ? details.flightNumber : flight.flightNumber;
    const departureTime = typeof details.departureTime === "string" ? details.departureTime : "time unavailable";
    const arrivalTime = typeof details.arrivalTime === "string" ? details.arrivalTime : "time unavailable";
    return `Approved flight sent to your travel dashboard and verified by AeroDataBox: ${airline} ${flightNumber}, ${flight.departure} → ${flight.arrival} on ${flight.date}. Departure ${departureTime}; arrival ${arrivalTime}.`;
  } catch (error) {
    return `I couldn't reach Django to send the approved flight: ${String(error)}`;
  }
}

async function saveDestination(destination: string): Promise<string> {
  const baseUrl = (process.env.DJANGO_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const token = process.env.DJANGO_API_TOKEN?.trim();
  if (!token) return "I couldn't update your dashboard because DJANGO_API_TOKEN is not configured for the TypeScript server.";

  try {
    const response = await fetch(`${baseUrl}/api/agent/destination/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Token": token },
      body: JSON.stringify({ destination }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isRecord(payload) || typeof payload.destination !== "string") {
      const error = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Django returned HTTP ${response.status}.`;
      return `I couldn't update your travel dashboard: ${error}`;
    }
    return `I've added ${payload.destination} to your travel dashboard.`;
  } catch (error) {
    return `I couldn't reach Django to update your travel dashboard: ${String(error)}`;
  }
}

const app = await Spectrum({
  projectId: process.env.PROJECT_ID!,
  projectSecret: process.env.PROJECT_SECRET!,
  providers: [
    imessage.config(),
  ],
});

for await (const [space, message] of app.messages) {
  if (message.content.type === "text") {
    // This prints EVERY TIME an incoming message arrives
    console.log(`Received incoming message: ${message.content.text}`);

    try {
      const chatId = `${message.platform}:${space.id}`;
      if (pendingGroupMembers.length > 0) {
        try {
          const currentMembers = await space.getMembers();
          const currentIds = new Set(currentMembers.map((member) => member.id.toLowerCase()));
          const newMembers = pendingGroupMembers.filter((member) => !currentIds.has(member.toLowerCase()));
          if (newMembers.length > 0) await space.add(newMembers);
          console.log(`[iMessage] Startup member flag applied to group chat (${newMembers.length} added).`);
          pendingGroupMembers = [];
        } catch (error) {
          if (isRecord(error) && error.name === "UnsupportedError") {
            if (!reportedNoGroupYet) {
              console.log("[iMessage] Startup member flag is waiting for a group chat; direct messages are skipped.");
              reportedNoGroupYet = true;
            }
          } else {
            console.error("[iMessage] Could not add startup members; it will retry on the next group chat message:", error);
          }
        }
      }
      const incomingText = message.content.text.trim();
      const pending = pendingFlights.get(chatId);
      if (pending && pending.expiresAt <= Date.now()) pendingFlights.delete(chatId);
      const activePending = pendingFlights.get(chatId);
      if (activePending && /^(approve|approve flight)$/i.test(incomingText)) {
        pendingFlights.delete(chatId);
        const replyText = await submitApprovedFlight(activePending.flight);
        rememberTurn(chatId, { role: "user", text: message.content.text });
        rememberTurn(chatId, { role: "assistant", text: replyText });
        await space.send(replyText);
        continue;
      }
      if (activePending && /^(cancel|cancel flight)$/i.test(incomingText)) {
        pendingFlights.delete(chatId);
        const replyText = "Okay, I discarded that flight. It was not sent to Django.";
        rememberTurn(chatId, { role: "user", text: message.content.text });
        rememberTurn(chatId, { role: "assistant", text: replyText });
        await space.send(replyText);
        continue;
      }
      const turns = chatMemory.get(chatId) ?? [];
      const conversation = [
        ...turns.map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`),
        `User: ${message.content.text}`,
      ].join("\n");

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: conversation,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          maxOutputTokens: 512,
          systemInstruction: "You are a helpful and concise assistant responding via iMessage/RCS. When the user asks to test or verify tool calling, call verify_tool. For flight searches, use the searchFlights tool only after you have a departure airport, destination airport, and travel date. If a request is ambiguous (for example, a state with several airports) or any detail is missing, ask a concise follow-up instead of guessing. Morning means before noon; if the user also says before 12 AM/midnight, clarify because that conflicts with morning. Search only returns a direct flight and asks the user to reply exactly APPROVE. Never claim a flight was sent or verified until the approval handler confirms Django did so. Do not book flights. When travel planning comes up and the destination is unknown, you may ask once in a casual, optional way, such as 'Have you settled on a destination yet? No worries if not.' Do not press, repeat the question after a decline or uncertainty, or require an answer. When the user clearly shares their planned destination, save it with saveDestination without asking for approval; don't save hypothetical places or destinations they mention for someone else's trip.",
          tools: [{ functionDeclarations: toolDeclarations }],
        }
      });
      const usage = response.usageMetadata;
      if (usage) {
        console.log(`[GEMINI USAGE] model=${GEMINI_MODEL} input_tokens=${usage.promptTokenCount ?? 0} output_tokens=${usage.candidatesTokenCount ?? 0} total_tokens=${usage.totalTokenCount ?? 0}`);
      }

      const toolCalls = response.functionCalls ?? [];
      let replyText = response.text || "I couldn't generate a response.";

      if (toolCalls.length > 0) {
        const toolResults = await Promise.all(toolCalls.map(async (toolCall) => {
          let result: unknown;

          if (toolCall.name === "verify_tool") {
            const phrase = typeof toolCall.args?.phrase === "string" ? toolCall.args.phrase : "verified";
            console.log(`[TOOL CALLED] verify_tool({ phrase: "${phrase}" })`);
            result = { result: `✅ TOOL RAN: ${phrase}` };
          } else if (toolCall.name === "searchFlights") {
            const origin = typeof toolCall.args?.origin === "string" ? toolCall.args.origin : "";
            const destination = typeof toolCall.args?.destination === "string" ? toolCall.args.destination : "";
            const outboundDate = typeof toolCall.args?.outboundDate === "string" ? toolCall.args.outboundDate : "";
            const departureWindow = typeof toolCall.args?.departureWindow === "string" ? toolCall.args.departureWindow : "any";
            if (!origin.trim() || !destination.trim() || !outboundDate.trim()) {
              result = "Departure airport, destination airport, and travel date are required.";
            } else {
              console.log(`[TOOL CALLED] searchFlights({ origin: "${origin}", destination: "${destination}", outboundDate: "${outboundDate}", departureWindow: "${departureWindow}" })`);
              const searchResult = await searchFlights(origin, destination, outboundDate, departureWindow);
              if (searchResult.flight) {
                pendingFlights.set(chatId, { flight: searchResult.flight, expiresAt: Date.now() + 10 * 60 * 1000 });
              }
              result = searchResult.message;
            }
          } else if (toolCall.name === "saveDestination") {
            const destination = typeof toolCall.args?.destination === "string" ? toolCall.args.destination.trim() : "";
            if (!destination) {
              result = "A destination is required.";
            } else {
              console.log("[TOOL CALLED] saveDestination(...)");
              result = await saveDestination(destination);
            }
          } else {
            result = { error: `Unknown tool: ${toolCall.name}` };
          }

          return { name: toolCall.name, result };
        }));

        replyText = toolResults.map(({ name, result }) => name === "verify_tool"
          ? String((result as { result: string }).result)
          : String(result))
          .join("\n\n");
      }

      rememberTurn(chatId, { role: "user", text: message.content.text });
      rememberTurn(chatId, { role: "assistant", text: replyText });
      try {
        await space.send(replyText);
      } catch (sendError) {
        // Do not send a second message here: the first send may have reached
        // the carrier even when delivery confirmation failed.
        console.error("iMessage send failed; not retrying automatically:", sendError);
      }
      
    } catch (error) {
      console.error("Agent turn failed:", error);
    }
  }
}
