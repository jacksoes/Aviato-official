from django.urls import path

from api.views import agent_approve_flight, agent_save_destination, current_agent_destination, current_agent_flight, flight_lookup, health

urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/flights/lookup/", flight_lookup, name="flight-lookup"),
    path("api/agent/flights/approve/", agent_approve_flight, name="agent-flight-approve"),
    path("api/flights/current/", current_agent_flight, name="current-agent-flight"),
    path("api/agent/destination/", agent_save_destination, name="agent-save-destination"),
    path("api/destination/current/", current_agent_destination, name="current-agent-destination"),
]
