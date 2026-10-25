from django.urls import path

from api.views import agent_approve_flight, agent_approve_hotel, agent_save_destination, agent_save_travel_dates, current_agent_destination, current_agent_flight, current_agent_hotel, current_agent_travel_dates, flight_lookup, health

urlpatterns = [
    path("api/health/", health, name="health"),
    path("api/flights/lookup/", flight_lookup, name="flight-lookup"),
    path("api/agent/flights/approve/", agent_approve_flight, name="agent-flight-approve"),
    path("api/flights/current/", current_agent_flight, name="current-agent-flight"),
    path("api/agent/hotels/approve/", agent_approve_hotel, name="agent-hotel-approve"),
    path("api/hotels/current/", current_agent_hotel, name="current-agent-hotel"),
    path("api/agent/destination/", agent_save_destination, name="agent-save-destination"),
    path("api/destination/current/", current_agent_destination, name="current-agent-destination"),
    path("api/agent/travel-dates/", agent_save_travel_dates, name="agent-save-travel-dates"),
    path("api/travel-dates/current/", current_agent_travel_dates, name="current-agent-travel-dates"),
]
