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
  name: "searchHotels",
  description: "Search Google Hotels for available stays. Only call after you know the destination, check-in date, and check-out date; ask a brief follow-up for missing dates. Show the user up to five numbered options. After they choose one, ask for explicit approval by telling them to reply exactly APPROVE HOTEL. Do not send a hotel to Django before that approval, and never claim a hotel is booked.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      destination: { type: Type.STRING, description: "City, neighborhood, or destination to search for hotels in." },
      checkInDate: { type: Type.STRING, description: "Check-in date in YYYY-MM-DD format." },
      checkOutDate: { type: Type.STRING, description: "Check-out date in YYYY-MM-DD format, later than check-in." },
      adults: { type: Type.INTEGER, description: "Number of adult guests; defaults to 2 if not specified." },
    },
    required: ["destination", "checkInDate", "checkOutDate"],
  },
}, {
  name: "saveTravelDates",
  description: "Silently save the user's clearly stated trip date or date range to the Django dashboard. Use exact YYYY-MM-DD calendar dates. Only call when you can resolve the year and dates confidently; otherwise ask a short clarification and do not save. A single date is allowed when the user only gave one travel date. Never tell the user that you saved or changed the dates.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING, description: "Trip start date in YYYY-MM-DD format." },
      endDate: { type: Type.STRING, description: "Optional trip end date in YYYY-MM-DD format, same day or after startDate." },
    },
    required: ["startDate"],
  },
}, {
  name: "saveDestination",
  description: "Silently save a U.S. state to the Django travel dashboard. Call only when the user clearly says where they plan to travel AND you can confidently identify the destination's U.S. state (for example, Miami means Florida). Pass the full canonical state name only, never a city, country, or non-U.S. destination. If the state is ambiguous or cannot be identified confidently, ask a brief clarification and do not call this tool. Do not save hypothetical destinations or trips for someone else. After a successful save, do not announce, describe, or repeat the destination; the dashboard update is silent.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      destination: { type: Type.STRING, description: "The canonical full name of the U.S. state for the user's intended trip, such as Florida or New York." },
    },
    required: ["destination"],
  },
}];

type ChatTurn = { role: "user" | "assistant"; text: string };
type ApprovedFlight = { flightNumber: string; date: string; departure: string; arrival: string };
type ApprovedHotel = {
  name: string;
  location: string;
  checkIn: string;
  checkOut: string;
  nightlyPrice: string;
  totalPrice: string;
  rating: string;
  bookingUrl: string;
  imageUrl: string;
};
const chatMemory = new Map<string, ChatTurn[]>();
const pendingFlights = new Map<string, { flight: ApprovedFlight; expiresAt: number }>();
const pendingHotelSearches = new Map<string, { hotels: ApprovedHotel[]; expiresAt: number }>();
const pendingHotelApprovals = new Map<string, { hotel: ApprovedHotel; expiresAt: number }>();
const US_STATE_NAMES = new Set([
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts",
  "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
]);
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
        "If you'd like to add this flight to your travel dashboard, reply exactly APPROVE. I'll verify the flight details and add it after you approve. Reply CANCEL to discard it.",
      ].filter(Boolean).join("\n"),
    };
  } catch (error) {
    return { message: `Could not reach Google Flights search: ${String(error)}` };
  }
}

function readHttpsUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function searchHotels(
  destination: string,
  checkInDate: string,
  checkOutDate: string,
  adults = 2,
): Promise<{ message: string; hotels?: ApprovedHotel[] }> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return { message: "Hotel search is not configured. Set SERPAPI_API_KEY to your SerpApi key." };
  const place = destination.trim();
  if (!place || place.length > 120) return { message: "Please provide a hotel destination under 120 characters." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkInDate) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDate)) {
    return { message: "Please provide check-in and check-out dates in YYYY-MM-DD format." };
  }
  if (checkOutDate <= checkInDate) return { message: "Check-out must be later than check-in." };
  const guestCount = Number.isInteger(adults) && adults >= 1 && adults <= 10 ? adults : 2;

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_hotels");
    url.searchParams.set("q", place);
    url.searchParams.set("check_in_date", checkInDate);
    url.searchParams.set("check_out_date", checkOutDate);
    url.searchParams.set("adults", String(guestCount));
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
      return { message: `Hotel search failed with HTTP ${response.status}.` };
    }
    if (!response.ok || !isRecord(result)) return { message: `Hotel search failed with HTTP ${response.status}.` };
    if (typeof result.error === "string") return { message: `Hotel search failed: ${result.error}` };

    const properties = Array.isArray(result.properties) ? result.properties.filter(isRecord) : [];
    const hotels = properties.slice(0, 5).flatMap((property): ApprovedHotel[] => {
      const name = typeof property.name === "string" ? property.name.trim() : "";
      if (!name) return [];
      const rate = isRecord(property.rate_per_night) ? property.rate_per_night : {};
      const totalRate = isRecord(property.total_rate) ? property.total_rate : {};
      const image = Array.isArray(property.images) && isRecord(property.images[0]) ? property.images[0] : {};
      const ratingValue = typeof property.overall_rating === "number" ? property.overall_rating : null;
      const reviews = typeof property.reviews === "number" ? property.reviews : null;
      const rating = ratingValue === null
        ? "Rating unavailable"
        : `${ratingValue.toFixed(1)}/5${reviews === null ? "" : ` (${reviews} reviews)`}`;
      const address = typeof property.address === "string" ? property.address : place;
      return [{
        name,
        location: address.slice(0, 240),
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nightlyPrice: typeof rate.display_price === "string" ? rate.display_price : typeof property.price === "string" ? property.price : "Price unavailable",
        totalPrice: typeof totalRate.display_price === "string" ? totalRate.display_price : "Total price unavailable",
        rating,
        bookingUrl: readHttpsUrl(property.link),
        imageUrl: readHttpsUrl(image.thumbnail) || readHttpsUrl(property.thumbnail),
      }];
    });

    if (hotels.length === 0) return { message: `No hotel results were found in ${place} for those dates. Try another destination or dates.` };
    const lines = hotels.map((hotel, index) =>
      `${index + 1}. ${hotel.name} — ${hotel.nightlyPrice}/night; total ${hotel.totalPrice}; ${hotel.rating}. ${hotel.location}${hotel.bookingUrl ? `\n${hotel.bookingUrl}` : ""}`
    );
    return {
      hotels,
      message: [
        `I found these hotel options in ${place} for ${checkInDate} to ${checkOutDate} (${guestCount} adult${guestCount === 1 ? "" : "s"}). These are search results, not reservations:`,
        ...lines,
        "Reply with the option number you want. I'll show you the details and ask for your approval before adding it to your dashboard.",
      ].join("\n\n"),
    };
  } catch (error) {
    return { message: `Could not reach Google Hotels search: ${String(error)}` };
  }
}

const GEMINI_MODEL = "gemini-3.8-flash";
const todayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());
const todayByPart = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
const todayForAgent = `${todayByPart.year}-${todayByPart.month}-${todayByPart.day}`;
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

async function submitApprovedHotel(hotel: ApprovedHotel): Promise<string> {
  const baseUrl = (process.env.DJANGO_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const token = process.env.DJANGO_API_TOKEN?.trim();
  if (!token) return "I couldn't send the approved hotel because DJANGO_API_TOKEN is missing from AI-agent/.env. Set the same token in travel-agent-backend/.env, then restart the TypeScript server and Django.";

  try {
    const response = await fetch(`${baseUrl}/api/agent/hotels/approve/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Token": token },
      body: JSON.stringify(hotel),
      signal: AbortSignal.timeout(15_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isRecord(payload) || !isRecord(payload.hotel)) {
      const error = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Django returned HTTP ${response.status}.`;
      return `Django could not add the approved hotel: ${error}`;
    }
    const savedHotel = payload.hotel;
    const name = typeof savedHotel.name === "string" ? savedHotel.name : hotel.name;
    const location = typeof savedHotel.location === "string" ? savedHotel.location : hotel.location;
    return `I've added ${name} in ${location} to your travel dashboard. It's selected for ${hotel.checkIn} to ${hotel.checkOut}, but it has not been booked.`;
  } catch (error) {
    return `I couldn't reach Django to add the approved hotel: ${String(error)}`;
  }
}

async function saveDestination(destination: string): Promise<{ success: boolean; message: string }> {
  const canonicalState = [...US_STATE_NAMES].find((state) => state.toLowerCase() === destination.trim().toLowerCase());
  if (!canonicalState) return { success: false, message: "I can only add a U.S. state to your dashboard. Which state is your destination in?" };
  const baseUrl = (process.env.DJANGO_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const token = process.env.DJANGO_API_TOKEN?.trim();
  if (!token) return { success: false, message: "I couldn't update your dashboard because DJANGO_API_TOKEN is not configured for the TypeScript server." };

  try {
    const response = await fetch(`${baseUrl}/api/agent/destination/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Token": token },
      body: JSON.stringify({ destination: canonicalState }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isRecord(payload) || typeof payload.destination !== "string") {
      const error = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Django returned HTTP ${response.status}.`;
      return { success: false, message: `I couldn't update your travel dashboard: ${error}` };
    }
    return { success: true, message: "Destination updated." };
  } catch (error) {
    return { success: false, message: `I couldn't reach Django to update your travel dashboard: ${String(error)}` };
  }
}

async function saveTravelDates(startDate: string, endDate: string): Promise<{ success: boolean; message: string }> {
  const baseUrl = (process.env.DJANGO_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  const token = process.env.DJANGO_API_TOKEN?.trim();
  if (!token) return { success: false, message: "I couldn't update your dashboard because DJANGO_API_TOKEN is not configured for the TypeScript server." };

  try {
    const response = await fetch(`${baseUrl}/api/agent/travel-dates/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Token": token },
      body: JSON.stringify({ startDate, endDate: endDate || null }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await response.json();
    if (!response.ok || !isRecord(payload) || !isRecord(payload.dates)) {
      const error = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Django returned HTTP ${response.status}.`;
      return { success: false, message: `I couldn't update the trip dates on your dashboard: ${error}` };
    }
    return { success: true, message: "Trip dates updated." };
  } catch (error) {
    return { success: false, message: `I couldn't reach Django to update the trip dates: ${String(error)}` };
  }
}

function parseHotelSelection(text: string): number | null {
  const normalized = text.trim().toLowerCase();
  const numeric = normalized.match(/^(?:(?:hotel|option|number|choose|pick|select)\s*)?#?\s*(\d+)(?:st|nd|rd|th)?(?:\s+(?:one|hotel))?$/);
  if (numeric) return Number(numeric[1]);
  const worded = normalized.match(/^(?:the\s+)?(first|one|1st|second|two|2nd|third|three|3rd|fourth|four|4th|fifth|five|5th)(?:\s+one)?$/);
  if (!worded) return null;
  const choice = worded[1];
  if (["first", "one", "1st"].includes(choice)) return 1;
  if (["second", "two", "2nd"].includes(choice)) return 2;
  if (["third", "three", "3rd"].includes(choice)) return 3;
  if (["fourth", "four", "4th"].includes(choice)) return 4;
  return 5;
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
      const pendingHotelSearch = pendingHotelSearches.get(chatId);
      if (pendingHotelSearch && pendingHotelSearch.expiresAt <= Date.now()) pendingHotelSearches.delete(chatId);
      const pendingHotelApproval = pendingHotelApprovals.get(chatId);
      if (pendingHotelApproval && pendingHotelApproval.expiresAt <= Date.now()) pendingHotelApprovals.delete(chatId);

      const activeHotelApproval = pendingHotelApprovals.get(chatId);
      if (activeHotelApproval && /^approve hotel$/i.test(incomingText)) {
        pendingHotelApprovals.delete(chatId);
        const replyText = await submitApprovedHotel(activeHotelApproval.hotel);
        rememberTurn(chatId, { role: "user", text: message.content.text });
        rememberTurn(chatId, { role: "assistant", text: replyText });
        await space.send(replyText);
        continue;
      }
      if (activeHotelApproval && /^cancel hotel$/i.test(incomingText)) {
        pendingHotelApprovals.delete(chatId);
        const replyText = "Okay, I discarded that hotel choice. It was not sent to Django or booked.";
        rememberTurn(chatId, { role: "user", text: message.content.text });
        rememberTurn(chatId, { role: "assistant", text: replyText });
        await space.send(replyText);
        continue;
      }
      if (activeHotelApproval && /^approve$/i.test(incomingText)) {
        const replyText = "To approve the selected hotel, reply exactly APPROVE HOTEL. It will be added to your dashboard but not booked.";
        rememberTurn(chatId, { role: "user", text: message.content.text });
        rememberTurn(chatId, { role: "assistant", text: replyText });
        await space.send(replyText);
        continue;
      }
      const activeHotelSearch = pendingHotelSearches.get(chatId);
      if (activeHotelSearch) {
        if (/^(cancel|cancel hotels|cancel hotel search)$/i.test(incomingText)) {
          pendingHotelSearches.delete(chatId);
          const replyText = "Okay, I cleared those hotel options. Nothing was sent to Django.";
          rememberTurn(chatId, { role: "user", text: message.content.text });
          rememberTurn(chatId, { role: "assistant", text: replyText });
          await space.send(replyText);
          continue;
        }
        const selectedNumber = parseHotelSelection(incomingText);
        if (selectedNumber !== null) {
          const selectedHotel = activeHotelSearch.hotels[selectedNumber - 1];
          if (!selectedHotel) {
            const replyText = `Please choose a number from 1 to ${activeHotelSearch.hotels.length}, or reply CANCEL HOTEL.`;
            rememberTurn(chatId, { role: "user", text: message.content.text });
            rememberTurn(chatId, { role: "assistant", text: replyText });
            await space.send(replyText);
            continue;
          }
          pendingHotelSearches.delete(chatId);
          pendingHotelApprovals.set(chatId, { hotel: selectedHotel, expiresAt: Date.now() + 10 * 60 * 1000 });
          const replyText = [
            "You selected this hotel (not booked):",
            `${selectedHotel.name} — ${selectedHotel.location}`,
            `Stay: ${selectedHotel.checkIn} to ${selectedHotel.checkOut}`,
            `Price: ${selectedHotel.nightlyPrice} per night; total ${selectedHotel.totalPrice}`,
            `Rating: ${selectedHotel.rating}`,
            "To add these details to your dashboard, reply exactly APPROVE HOTEL. This will not make a reservation. Reply CANCEL HOTEL to discard it.",
          ].join("\n");
          rememberTurn(chatId, { role: "user", text: message.content.text });
          rememberTurn(chatId, { role: "assistant", text: replyText });
          await space.send(replyText);
          continue;
        }
      }

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
          systemInstruction: `You are a helpful and concise assistant responding via iMessage/RCS. Today is ${todayForAgent} in America/New_York. When the user asks to test or verify tool calling, call verify_tool. For flight searches, use searchFlights only after you know the departure airport, destination airport, and travel date. If details are missing or ambiguous, ask a concise follow-up instead of guessing. Search only returns a direct flight and asks the user to reply exactly APPROVE. Never claim a flight was sent until approval handler confirms Django did so; do not book flights. For hotel searches, use searchHotels only after you know destination and check-in/check-out dates; ask for missing details. The user selects a numbered option, then must explicitly reply exactly APPROVE HOTEL before it is sent to Django. Never claim a hotel was sent until that approval handler confirms it, and never claim it is booked. When travel planning comes up and destination is unknown, you may ask once casually and optionally; do not press or repeat after decline or uncertainty. Save a destination only when the user clearly states a planned trip and you can confidently identify its U.S. state. Pass only the full canonical state name to saveDestination (for example, a clear destination of Miami maps to Florida); if the state is uncertain, ask which state and do not save yet. Never save a city, country, non-U.S. destination, hypothetical place, or trip for someone else. Save a trip date or date range silently with saveTravelDates whenever the user clearly states dates for their own planned trip and you can resolve them to exact calendar dates; interpret relative dates using today's date above, and ask a brief clarification if the year or range is ambiguous. Do not announce that dates were saved or changed on the dashboard. A successful saveDestination call also updates silently; never announce it.`,
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
          } else if (toolCall.name === "searchHotels") {
            const destination = typeof toolCall.args?.destination === "string" ? toolCall.args.destination : "";
            const checkInDate = typeof toolCall.args?.checkInDate === "string" ? toolCall.args.checkInDate : "";
            const checkOutDate = typeof toolCall.args?.checkOutDate === "string" ? toolCall.args.checkOutDate : "";
            const adultsValue = toolCall.args?.adults;
            const adults = typeof adultsValue === "number" ? adultsValue : 2;
            if (!destination.trim() || !checkInDate.trim() || !checkOutDate.trim()) {
              result = "Destination, check-in date, and check-out date are required.";
            } else {
              console.log(`[TOOL CALLED] searchHotels({ destination: "${destination}", checkInDate: "${checkInDate}", checkOutDate: "${checkOutDate}" })`);
              const searchResult = await searchHotels(destination, checkInDate, checkOutDate, adults);
              if (searchResult.hotels?.length) {
                pendingHotelSearches.set(chatId, { hotels: searchResult.hotels, expiresAt: Date.now() + 10 * 60 * 1000 });
                pendingHotelApprovals.delete(chatId);
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
          } else if (toolCall.name === "saveTravelDates") {
            const startDate = typeof toolCall.args?.startDate === "string" ? toolCall.args.startDate.trim() : "";
            const endDate = typeof toolCall.args?.endDate === "string" ? toolCall.args.endDate.trim() : "";
            if (!startDate) {
              result = { success: false, message: "A trip start date is required." };
            } else {
              console.log("[TOOL CALLED] saveTravelDates(...)");
              result = await saveTravelDates(startDate, endDate);
            }
          } else {
            result = { error: `Unknown tool: ${toolCall.name}` };
          }

          return { name: toolCall.name, result };
        }));

        const silentDashboardUpdate = toolResults.length > 0 && toolResults.every(({ name, result }) =>
          (name === "saveDestination" || name === "saveTravelDates")
          && isRecord(result)
          && result.success === true,
        );
        if (silentDashboardUpdate) {
          // A silent dashboard update is one step in the turn, not the end of it.
          // Continue the conversation so the agent can ask for missing flight details
          // or search immediately when it already has everything it needs.
          const followUp = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: `${conversation}\nAssistant: The trip details were saved successfully. Do not mention this update. Continue responding to the user's original request. If they asked for a flight and all required details are known, call searchFlights; otherwise ask for the missing details.`,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              maxOutputTokens: 512,
              systemInstruction: `You are a helpful and concise assistant responding via iMessage/RCS. Today is ${todayForAgent} in America/New_York. For flight searches, use searchFlights only when the departure airport, destination airport, and travel date are known; ask a concise follow-up if anything is missing or ambiguous. Search only returns a direct flight and asks the user to reply exactly APPROVE. Never book a flight or claim it was sent to Django before approval. Do not mention internal dashboard updates.`,
              tools: [{ functionDeclarations: toolDeclarations.filter((tool) => tool.name === "searchFlights") }],
            },
          });
          const followUpFlightCall = followUp.functionCalls?.find((call) => call.name === "searchFlights");
          if (followUpFlightCall) {
            const origin = typeof followUpFlightCall.args?.origin === "string" ? followUpFlightCall.args.origin.trim() : "";
            const destination = typeof followUpFlightCall.args?.destination === "string" ? followUpFlightCall.args.destination.trim() : "";
            const outboundDate = typeof followUpFlightCall.args?.outboundDate === "string" ? followUpFlightCall.args.outboundDate.trim() : "";
            const departureWindow = typeof followUpFlightCall.args?.departureWindow === "string" ? followUpFlightCall.args.departureWindow : "any";
            if (origin && destination && outboundDate) {
              console.log(`[TOOL CALLED] searchFlights({ origin: "${origin}", destination: "${destination}", outboundDate: "${outboundDate}", departureWindow: "${departureWindow}" })`);
              const searchResult = await searchFlights(origin, destination, outboundDate, departureWindow);
              if (searchResult.flight) pendingFlights.set(chatId, { flight: searchResult.flight, expiresAt: Date.now() + 10 * 60 * 1000 });
              replyText = searchResult.message;
            } else {
              replyText = "What date would you like to travel?";
            }
          } else {
            replyText = followUp.text || "What date would you like to travel?";
          }
        } else replyText = toolResults.map(({ name, result }) => {
          if (name === "verify_tool") return String((result as { result: string }).result);
          if ((name === "saveDestination" || name === "saveTravelDates") && isRecord(result)) {
            return result.success === true ? "" : String(result.message ?? "");
          }
          return String(result);
        }).filter(Boolean).join("\n\n");
      }

      rememberTurn(chatId, { role: "user", text: message.content.text });
      if (replyText) rememberTurn(chatId, { role: "assistant", text: replyText });
      if (!replyText) continue;
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
