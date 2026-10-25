from django.urls import path

from api.views import agent_approve_flight, current_agent_flight, flight_lookup, health, ping

urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/ping/", ping, name="ping"),
    path("api/flights/lookup/", flight_lookup, name="flight-lookup"),
    path("api/agent/flights/approve/", agent_approve_flight, name="agent-flight-approve"),
    path("api/flights/current/", current_agent_flight, name="current-agent-flight"),
]
