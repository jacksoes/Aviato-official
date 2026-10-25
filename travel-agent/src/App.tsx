import './App.css'
import { useEffect, useState } from 'react'
import { FlightBookingCard, type FlightDetails } from './components/FlightBookingCard'
import { DestinationStateOutline, findUsState } from './components/DestinationStateOutline'
import { HotelBookingCard, type HotelDetails } from './components/HotelBookingCard'
import { OverviewCard } from './components/OverviewCard'

const emptyFlight: FlightDetails = {
  airline: 'Airline not selected',
  flightNumber: '—',
  departure: 'Departure airport',
  arrival: 'Arrival airport',
  departureTime: 'Date & time TBD',
  arrivalTime: 'Date & time TBD',
  confirmation: 'Waiting for AI agent approval',
  status: 'Awaiting approval',
}

const hotel: HotelDetails = {
  name: 'Hotel not selected',
  location: 'Destination TBD',
  checkIn: 'Check-in date TBD',
  checkOut: 'Check-out date TBD',
  confirmation: 'Not reserved',
  status: 'Not reserved',
}

function App() {
  const [apiStatus, setApiStatus] = useState('Connecting to API…')
  const [flight, setFlight] = useState<FlightDetails>(emptyFlight)
  const [destination, setDestination] = useState<string | null>(null)
  const destinationState = findUsState(destination)

  useEffect(() => {
    fetch('/api/ping/')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<{ message: string }>
      })
      .then(({ message }) => {
        console.log('Backend ping response:', message)
        setApiStatus(`Backend connected: ${message}`)
      })
      .catch(() => setApiStatus('Backend unavailable'))
  }, [])

  useEffect(() => {
    let stopped = false
    async function refreshTripDetails() {
      try {
        const [flightResponse, destinationResponse] = await Promise.all([
          fetch('/api/flights/current/'),
          fetch('/api/destination/current/'),
        ])
        if (!flightResponse.ok || !destinationResponse.ok) throw new Error('Trip details unavailable')
        const [flightResult, destinationResult] = await Promise.all([
          flightResponse.json() as Promise<{ flight: FlightDetails | null }>,
          destinationResponse.json() as Promise<{ destination: string | null }>,
        ])
        if (stopped) return
        if (flightResult.flight) setFlight(flightResult.flight)
        if (destinationResult.destination) setDestination(destinationResult.destination)
      } catch {
        // Keep showing the last received trip details during temporary API outages.
      }
    }
    void refreshTripDetails()
    const timer = window.setInterval(() => void refreshTripDetails(), 3000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <main className="dashboard">
      <nav className="topbar">
        <a className="brand" href="#">
          <span className="brand-icon">✳</span>
          waypoint
        </a>

        <div className="nav-right">
          <span className="trip-label">MY TRAVEL DASHBOARD</span>
          <div className="avatar">T</div>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">
            <span className="live-dot" />
            YOUR NEXT ADVENTURE
          </span>

          <h1>
            Your next stop?
            <br />
            <span>{destination || 'Somewhere wonderful.'}</span>
          </h1>

          <p className="hero-description">
            Your flights, stay, and travel plans all in one place.
            Start with a destination and build your trip as you go.
          </p>

          <div className="destination-pill">
            <span className="destination-icon">⌖</span>
            <span>{destination || 'Destination not decided'}</span>
            <span className="pill-divider" />
            <span>Dates TBD</span>
          </div>
        </div>

        <div className={`hero-art${destinationState ? ' hero-art--state' : ''}`} aria-hidden="true">
          {destinationState ? <DestinationStateOutline state={destinationState} /> : (
            <>
              <div className="art-sun" />
              <div className="art-circle art-circle-one" />
              <div className="art-circle art-circle-two" />
              <div className="art-plane">✈</div>
              <div className="art-path" />
              <div className="art-pin">⌖</div>
              <span className="art-caption">THE WORLD IS OPEN</span>
            </>
          )}
        </div>
      </section>

      <section className="section overview-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">AT A GLANCE</p>
            <h2>Your trip overview</h2>
          </div>
          <span className="muted-text" role="status">{apiStatus}</span>
        </div>

        <div className="overview-grid">
          <OverviewCard
            icon="⌖"
            iconColor="purple"
            status={destination ? 'Selected' : 'To decide'}
            label="DESTINATION"
            title={destination || 'Somewhere new'}
            description={destination ? 'Shared with your AI agent' : 'Your AI agent can ask when it fits'}
          />
          <OverviewCard
            icon="✈"
            iconColor="blue"
            status={flight.status}
            label="FLIGHTS & TICKETS"
            title={flight.flightNumber === '—' ? 'Waiting for approval' : flight.flightNumber}
            description={flight.flightNumber === '—' ? 'Approve a flight with your AI agent' : `${flight.departureCode || flight.departure} → ${flight.arrivalCode || flight.arrival}`}
          />
          <OverviewCard
            icon="▤"
            iconColor="orange"
            status={hotel.status}
            label="ACCOMMODATION"
            title="Stay to be decided"
            description="Hotel and reservation pending"
          />
          <OverviewCard
            icon="✓"
            iconColor="green"
            status="In planning"
            label="TRAVEL READINESS"
            title="Getting started"
            description="Your itinerary is not finalized"
          />
        </div>
      </section>

      <section className="section bookings-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">YOUR RESERVATIONS</p>
            <h2>Bookings &amp; tickets</h2>
          </div>
          <span className="booking-count">0 confirmed bookings</span>
        </div>

        <div className="booking-grid">
          <FlightBookingCard flight={flight} />
          <HotelBookingCard hotel={hotel} />
        </div>
      </section>

      <section className="planning-banner">
        <div className="planning-icon">✦</div>
        <div className="planning-copy">
          <h3>Every great trip starts somewhere.</h3>
          <p>
            {destination
              ? `Your trip to ${destination} is taking shape. Your dashboard will update as you plan.`
              : 'Your dashboard is ready. Share a destination with your AI agent whenever you have one in mind.'}
          </p>
        </div>
        <span className="planning-decoration">✈</span>
      </section>

      <footer className="footer">
        <span>waypoint <span className="footer-dot">✳</span></span>
        <span>YOUR JOURNEY, ORGANIZED.</span>
      </footer>
    </main>
  )
}

export default App
