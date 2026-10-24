from django.urls import path

from api.views import flight_lookup, health, ping

urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/ping/", ping, name="ping"),
    path("api/flights/lookup/", flight_lookup, name="flight-lookup"),
]
