import './App.css'
import { useEffect, useState } from 'react'
import { FlightBookingCard, type FlightLookupInput, type FlightDetails } from './components/FlightBookingCard'
import { HotelBookingCard, type HotelDetails } from './components/HotelBookingCard'
import { OverviewCard } from './components/OverviewCard'

const emptyFlight: FlightDetails = {
  airline: 'Airline not selected',
  flightNumber: '—',
  departure: 'Departure airport',
  arrival: 'Arrival airport',
  departureTime: 'Date & time TBD',
  arrivalTime: 'Date & time TBD',
  confirmation: 'Not booked',
  status: 'Not booked',
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

  async function lookupFlight(input: FlightLookupInput) {
    const response = await fetch('/api/flights/lookup/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const result = await response.json() as { flights?: FlightDetails[]; error?: string }
    if (!response.ok) throw new Error(result.error || 'Flight lookup failed.')
    return result.flights || []
  }

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
            <span>Somewhere wonderful.</span>
          </h1>

          <p className="hero-description">
            Your flights, stay, and travel plans all in one place.
            Start with a destination and build your trip as you go.
          </p>

          <div className="destination-pill">
            <span className="destination-icon">⌖</span>
            <span>Destination not decided</span>
            <span className="pill-divider" />
            <span>Dates TBD</span>
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="art-sun" />
          <div className="art-circle art-circle-one" />
          <div className="art-circle art-circle-two" />
          <div className="art-plane">✈</div>
          <div className="art-path" />
          <div className="art-pin">⌖</div>
          <span className="art-caption">THE WORLD IS OPEN</span>
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
            status="To decide"
            label="DESTINATION"
            title="Somewhere new"
            description="Choose where to go"
          />
          <OverviewCard
            icon="✈"
            iconColor="blue"
            status={flight.status}
            label="FLIGHTS & TICKETS"
            title="Not booked yet"
            description="Airline and ticket details pending"
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
          <FlightBookingCard flight={flight} onLookup={lookupFlight} onSelectFlight={setFlight} />
          <HotelBookingCard hotel={hotel} />
        </div>
      </section>

      <section className="planning-banner">
        <div className="planning-icon">✦</div>
        <div className="planning-copy">
          <h3>Every great trip starts somewhere.</h3>
          <p>
            Your dashboard is ready. Add your destination, book your flights,
            and find a place to stay when you are ready.
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
