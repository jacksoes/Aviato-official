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

Flight lookup uses AeroDataBox through RapidAPI. Subscribe to AeroDataBox on RapidAPI, then set `AERODATABOX_API_KEY` in the backend `.env`. The browser does not receive this key. After explicit user approval, the TypeScript server sends `flightNumber`, `date`, `departure`, and `arrival` to `POST /api/agent/flights/approve/`. It authenticates that request with `X-API-Token`; set the same `DJANGO_API_TOKEN` value in both the TypeScript server's and Django's `.env` files. Django validates the request, queries AeroDataBox, and the dashboard polls `GET /api/flights/current/` to display the returned details.

Hotel search uses Google Hotels results through SerpApi, with the existing `SERPAPI_API_KEY` in `AI-agent/.env`. The TypeScript agent presents up to five options; after the user selects one, it asks for the exact `APPROVE HOTEL` confirmation. Only then does the TypeScript server send the selected hotel's name, location, dates, prices, rating, and result links to `POST /api/agent/hotels/approve/` with the same `X-API-Token`. Django stores and exposes the approved selection at `GET /api/hotels/current/`; the dashboard polls that endpoint. This records a selected hotel for trip planning and does not make a reservation.

The agent sends a destination without a confirmation step to `POST /api/agent/destination/` only when it can identify a U.S. state; Django validates and canonicalizes it to the full state name. The dashboard polls `GET /api/destination/current/` and displays the matching state outline. Current flight, hotel, and destination selections are held in Django process memory and reset when the server restarts. The browser does not accept flight, hotel, or destination input. AeroDataBox schedule availability depends on coverage and your RapidAPI plan. Free/trial access may require attribution; see [AeroDataBox pricing and terms](https://aerodatabox.com/pricing) and [API documentation](https://doc.aerodatabox.com/).

`DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, and `DJANGO_ALLOWED_HOSTS` are also read from `.env`. Keep `.env` private; `.env.example` contains development defaults only.
