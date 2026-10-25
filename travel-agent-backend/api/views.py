import json
import os
import hmac
from datetime import date, datetime, time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.db import connections
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST


_current_agent_flight = None
_current_agent_destination = None


@require_GET
def health(request):
    """Report API status and whether MongoDB can be reached."""
    try:
        database = connections["default"]
        database.ensure_connection()
        database.connection.admin.command("ping")
    except Exception:
        return JsonResponse(
            {"status": "error", "database": "disconnected"}, status=503
        )
    return JsonResponse({"status": "ok", "database": "connected"})


def _movement_code(movement):
    movement = movement or {}
    airport = movement.get("airport") or {}
    if not isinstance(airport, dict):
        airport = {}
    return movement.get("iata") or movement.get("iataCode") or movement.get("icao") or movement.get("icaoCode") or airport.get("iata") or airport.get("icao") or ""


def _movement_name(movement):
    movement = movement or {}
    airport = movement.get("airport")
    if isinstance(airport, dict):
        airport = airport.get("name")
    nested_airport = movement.get("airport") or {}
    if not isinstance(nested_airport, dict):
        nested_airport = {}
    return airport or movement.get("airportName") or nested_airport.get("name") or _movement_code(movement)


def _movement_time(movement):
    movement = movement or {}
    value = (
        movement.get("actual")
        or movement.get("estimated")
        or movement.get("scheduled")
        or movement.get("scheduledTime")
        or movement.get("scheduledTimeLocal")
        or movement.get("scheduledTimeUtc")
        or "Time unavailable"
    )
    if isinstance(value, dict):
        return value.get("local") or value.get("utc") or "Time unavailable"
    return value


def _flight_payload(flight):
    departure = flight.get("departure") or {}
    arrival = flight.get("arrival") or {}
    airline = flight.get("airline") or {}
    flight_info = flight.get("flight") or {}
    if not isinstance(airline, dict):
        airline = {}
    if not isinstance(flight_info, dict):
        flight_info = {}
    flight_number = flight_info.get("iata") or flight_info.get("iataNumber") or flight_info.get("number") or flight.get("number") or flight.get("flightNumber") or "Unknown"
    return {
        "airline": airline.get("name") or airline.get("iataCode") or airline.get("iata") or (flight.get("airline") if isinstance(flight.get("airline"), str) else None) or "Airline unavailable",
        "flightNumber": flight_number,
        "departureCode": _movement_code(departure),
        "departure": _movement_name(departure) or "Departure airport",
        "arrivalCode": _movement_code(arrival),
        "arrival": _movement_name(arrival) or "Arrival airport",
        "departureTime": _movement_time(departure),
        "arrivalTime": _movement_time(arrival),
        "confirmation": "Flight data by AeroDataBox",
        "status": str(flight.get("flight_status") or flight.get("status") or "Scheduled"),
    }


def _aerodatabox_get(path):
    api_key = os.getenv("AERODATABOX_API_KEY", "").strip()
    if not api_key:
        return None, JsonResponse(
            {"error": "Flight lookup is not configured. Set AERODATABOX_API_KEY in travel-agent-backend/.env."},
            status=503,
        )

    host = os.getenv("AERODATABOX_RAPIDAPI_HOST", "aerodatabox.p.rapidapi.com").strip()
    request = Request(
        f"https://{host}{path}",
        headers={"Accept": "application/json", "X-RapidAPI-Key": api_key, "X-RapidAPI-Host": host},
    )
    try:
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code in (401, 403):
            message, status = "AeroDataBox rejected the API key or this endpoint is not included in your RapidAPI plan. Check your key, host, and plan access.", 403
        elif error.code == 429:
            message, status = "AeroDataBox request limit reached. Check your RapidAPI quota and try again after it resets.", 429
        else:
            message, status = f"AeroDataBox could not complete the lookup (HTTP {error.code}). Check your RapidAPI subscription and endpoint access.", 502
        return None, JsonResponse({"error": message}, status=status)
    except (URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        return None, JsonResponse({"error": "Could not reach AeroDataBox. Check the backend network connection."}, status=502)

    if isinstance(payload, list):
        return payload, None
    return payload.get("departures") or payload.get("data") or payload.get("flights") or [], None


@require_POST
def flight_lookup(request):
    """Find a flight by flight number or by an airport pair and local date."""
    try:
        data = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Request body must be valid JSON."}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({"error": "Request body must be a JSON object."}, status=400)

    flight_number = str(data.get("flightNumber") or "").strip().upper()
    origin = str(data.get("departure") or "").strip().upper()
    destination = str(data.get("arrival") or "").strip().upper()
    flight_date = str(data.get("date") or "").strip()
    if not flight_date:
        return JsonResponse({"error": "Enter the flight date."}, status=400)
    try:
        date.fromisoformat(flight_date)
    except ValueError:
        return JsonResponse({"error": "Enter a valid date in YYYY-MM-DD format."}, status=400)

    if flight_number and len(flight_number.replace(" ", "")) > 10:
        return JsonResponse({"error": "Flight number must be 10 characters or fewer."}, status=400)
    if not flight_number and (not origin or not destination):
        return JsonResponse({"error": "Enter a flight number, or both departure and arrival airport codes."}, status=400)
    if (origin and len(origin) not in (3, 4)) or (destination and len(destination) not in (3, 4)):
        return JsonResponse({"error": "Use 3-letter IATA or 4-letter ICAO airport codes, such as JFK and LHR."}, status=400)

    compact_number = "".join(flight_number.split())
    if compact_number:
        flights, error = _aerodatabox_get(f"/flights/number/{compact_number}/{flight_date}")
    elif not origin:
        return JsonResponse({"error": "Enter a departure airport code to search by route."}, status=400)
    else:
        # Airport schedule requests cover a time window. Request both halves
        # of the local date, then filter down to the requested destination.
        day = date.fromisoformat(flight_date)
        flights = []
        error = None
        for hour in (0, 12):
            stamp = datetime.combine(day, time(hour)).strftime("%Y-%m-%dT%H:%M")
            batch, error = _aerodatabox_get(f"/flights/airports/iata/{origin}/{stamp}?direction=Departure&withLeg=true")
            if error:
                break
            flights.extend(batch)
        if error is None and destination:
            flights = [item for item in flights if _movement_code(item.get("arrival", {})).upper() == destination]

    if error is None and compact_number and origin:
        flights = [item for item in flights if _movement_code(item.get("departure", {})).upper() == origin]
    if error is None and compact_number and destination:
        flights = [item for item in flights if _movement_code(item.get("arrival", {})).upper() == destination]

    if error:
        return error
    results = [_flight_payload(flight) for flight in (flights or [])]
    if not results:
        return JsonResponse({"flights": [], "message": "No matching flight was returned. Check the flight details, AeroDataBox coverage, and your RapidAPI plan's date and endpoint access."})
    return JsonResponse({"flights": results})


@require_POST
def agent_approve_flight(request):
    """Accept an agent-approved flight, verify it with AeroDataBox, and publish it."""
    expected_token = os.getenv("DJANGO_API_TOKEN", "").strip()
    supplied_token = request.headers.get("X-API-Token", "").strip()
    if not expected_token or not hmac.compare_digest(supplied_token, expected_token):
        return JsonResponse({"error": "Agent authentication failed."}, status=401)

    try:
        data = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Request body must be valid JSON."}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({"error": "Request body must be a JSON object."}, status=400)

    required = ("flightNumber", "date", "departure", "arrival")
    if any(not str(data.get(key) or "").strip() for key in required):
        return JsonResponse({"error": "Flight number, date, departure, and arrival are required."}, status=400)

    # Reuse the existing validation and AeroDataBox lookup path.
    lookup_response = flight_lookup(request)
    if lookup_response.status_code != 200:
        return lookup_response
    lookup_payload = json.loads(lookup_response.content.decode("utf-8"))
    flights = lookup_payload.get("flights") or []
    requested_number = "".join(str(data["flightNumber"]).upper().split())
    requested_departure = str(data["departure"]).strip().upper()
    requested_arrival = str(data["arrival"]).strip().upper()
    matching = [
        item for item in flights
        if "".join(str(item.get("flightNumber", "")).upper().split()) == requested_number
        and str(item.get("departureCode", "")).upper() == requested_departure
        and str(item.get("arrivalCode", "")).upper() == requested_arrival
    ]
    if not matching:
        return JsonResponse({"error": "AeroDataBox did not return the approved flight on that route and date."}, status=404)

    global _current_agent_flight
    _current_agent_flight = {**matching[0], "date": str(data["date"]).strip()}
    return JsonResponse({"flight": _current_agent_flight})


@require_GET
def current_agent_flight(request):
    """Return the latest flight published after explicit agent approval."""
    return JsonResponse({"flight": _current_agent_flight})


@require_POST
def agent_save_destination(request):
    """Accept a destination the user shared with the TypeScript agent."""
    expected_token = os.getenv("DJANGO_API_TOKEN", "").strip()
    supplied_token = request.headers.get("X-API-Token", "").strip()
    if not expected_token or not hmac.compare_digest(supplied_token, expected_token):
        return JsonResponse({"error": "API authentication failed."}, status=401)

    try:
        data = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"error": "Request body must be valid JSON."}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({"error": "Request body must be a JSON object."}, status=400)

    destination = str(data.get("destination") or "").strip()
    if not destination:
        return JsonResponse({"error": "Enter a travel destination."}, status=400)
    if len(destination) > 120:
        return JsonResponse({"error": "Destination must be 120 characters or fewer."}, status=400)

    global _current_agent_destination
    _current_agent_destination = destination
    return JsonResponse({"destination": _current_agent_destination})


@require_GET
def current_agent_destination(request):
    """Return the latest destination shared with the TypeScript agent."""
    return JsonResponse({"destination": _current_agent_destination})
