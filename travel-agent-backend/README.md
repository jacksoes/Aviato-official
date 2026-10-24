# Travel Agent Backend

A Django API starter configured to connect to a local MongoDB server through MongoDB's official Django database backend.

## Requirements

- Python 3.10 or newer
- MongoDB running locally on `127.0.0.1:27017` (the default)

## Run locally (PowerShell)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python manage.py runserver
```

The API is available at `http://127.0.0.1:8000/`. Check the server and MongoDB connection at `http://127.0.0.1:8000/api/health/`.

By default, the server connects to `mongodb://127.0.0.1:27017` and uses the `viato` database. Set `MONGODB_URI` and `MONGODB_NAME` in `.env` to use a different local URI or database. For a MongoDB instance that requires authentication, put the credentials in the URI and URL-encode special characters in the username or password.

Flight lookup uses AeroDataBox through RapidAPI. Subscribe to AeroDataBox on RapidAPI, then set `AERODATABOX_API_KEY` in the backend `.env` to your RapidAPI key. The default host is `aerodatabox.p.rapidapi.com`; override it with `AERODATABOX_RAPIDAPI_HOST` only if RapidAPI shows a different host for your subscription. The browser calls Django and never receives this key. The endpoint accepts either `{"flightNumber":"B6 1023","departure":"JFK","arrival":"LAX","date":"2026-10-26"}` or `{"departure":"JFK","arrival":"LAX","date":"2026-10-26"}` at `POST /api/flights/lookup/`. Route lookup expects airport codes (IATA or ICAO). Flight number searches use AeroDataBox's flight number/date endpoint; route searches use the departure airport schedule and filter by arrival. Future schedule availability depends on coverage and your RapidAPI plan quota. The RapidAPI Basic plan is listed as a 7-day trial with 400 API units and a 1 request/second limit; check the current RapidAPI plan details and endpoint entitlements before relying on it. Free/trial access requires attributing AeroDataBox when displaying its data. See [AeroDataBox pricing and terms](https://aerodatabox.com/pricing) and [API documentation](https://doc.aerodatabox.com/).

`DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, and `DJANGO_ALLOWED_HOSTS` are also read from `.env`. Keep `.env` private; `.env.example` contains development defaults only.
