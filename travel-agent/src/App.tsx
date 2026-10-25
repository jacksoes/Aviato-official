import './App.css'
import { useEffect, useState } from 'react'
import { FlightBookingCard, type FlightDetails } from './components/FlightBookingCard'
import { DestinationStateOutline, findUsState } from './components/DestinationStateOutline'
import { HotelBookingCard, type HotelDetails } from './components/HotelBookingCard'
import { OverviewCard } from './components/OverviewCard'
import { RunwayScene3D } from './components/RunwayScene3D'

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

const emptyHotel: HotelDetails = {
  name: 'Hotel not selected',
  location: 'Destination TBD',
  checkIn: 'Check-in date TBD',
  checkOut: 'Check-out date TBD',
  confirmation: 'Not reserved',
  status: 'Not reserved',
}

function App() {
  const [flight, setFlight] = useState<FlightDetails>(emptyFlight)
  const [hotel, setHotel] = useState<HotelDetails>(emptyHotel)
  const [destination, setDestination] = useState<string | null>(null)
  const [launchTestCount, setLaunchTestCount] = useState(0)
  const [showTakeoffCelebration, setShowTakeoffCelebration] = useState(false)
  const [showRunwayCard, setShowRunwayCard] = useState(true)
  const [runwayCardExiting, setRunwayCardExiting] = useState(false)
  const destinationState = findUsState(destination)
  const hasFlight = flight.flightNumber !== '—'
  const hasHotel = hotel.name !== 'Hotel not selected'
    || hotel.location !== 'Destination TBD'
    || hotel.checkIn !== 'Check-in date TBD'
    || hotel.checkOut !== 'Check-out date TBD'
    || hotel.confirmation !== 'Not reserved'
    || hotel.status !== 'Not reserved'
  const isTravelReady = Boolean(destination && hasFlight && hasHotel)
  const launchTrigger = launchTestCount + Number(isTravelReady)
  const isRunwayLaunching = launchTrigger > 0

  useEffect(() => {
    setShowTakeoffCelebration(false)
  }, [launchTrigger])

  useEffect(() => {
    let stopped = false
    async function refreshTripDetails() {
      try {
        const [flightResponse, destinationResponse, hotelResponse] = await Promise.all([
          fetch('/api/flights/current/'),
          fetch('/api/destination/current/'),
          fetch('/api/hotels/current/'),
        ])
        if (!flightResponse.ok || !destinationResponse.ok || !hotelResponse.ok) throw new Error('Trip details unavailable')
        const [flightResult, destinationResult, hotelResult] = await Promise.all([
          flightResponse.json() as Promise<{ flight: FlightDetails | null }>,
          destinationResponse.json() as Promise<{ destination: string | null }>,
          hotelResponse.json() as Promise<{ hotel: HotelDetails | null }>,
        ])
        if (stopped) return
        if (flightResult.flight) setFlight(flightResult.flight)
        if (destinationResult.destination) setDestination(destinationResult.destination)
        if (hotelResult.hotel) setHotel(hotelResult.hotel)
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
          <img src="/aviato-logo.png" alt="Aviato" />
        </a>

        <div className="nav-right">
          <span className="trip-label">MY TRAVEL DASHBOARD</span>
          <div className="avatar" role="img" aria-label="Earth">🌎</div>
        </div>
      </nav>

      <section className={`hero${isTravelReady ? ' hero--ready' : ''}`}>
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
        </div>

        <div className="overview-grid">
          <OverviewCard
            icon="⌖"
            iconColor="purple"
            status={destination ? 'Selected' : 'To decide'}
            label="DESTINATION"
            title={destination || 'Somewhere new'}
            description={destination ? 'Shared with your AI agent' : 'Your AI agent can ask when it fits'}
            decided={Boolean(destination)}
          />
          <OverviewCard
            icon="✈"
            iconColor="blue"
            status={flight.status}
            label="FLIGHTS & TICKETS"
            title={!hasFlight ? 'Waiting for approval' : flight.flightNumber}
            description={!hasFlight ? 'Approve a flight with your AI agent' : `${flight.departureCode || flight.departure} → ${flight.arrivalCode || flight.arrival}`}
            decided={hasFlight}
          />
          <OverviewCard
            icon="▤"
            iconColor="orange"
            status={hotel.status}
            label="ACCOMMODATION"
            title={hasHotel ? hotel.name : 'Stay to be decided'}
            description={hasHotel ? hotel.location : 'Hotel and reservation pending'}
            decided={hasHotel}
          />
          <OverviewCard
            icon="✓"
            iconColor="green"
            status={isTravelReady ? 'All set' : 'In planning'}
            label="TRAVEL READINESS"
            title={isTravelReady ? 'Ready to go' : 'Getting started'}
            description={isTravelReady ? 'Your travel plans are all set' : 'Complete your destination, flight, and stay'}
            decided={isTravelReady}
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

      {showRunwayCard && <section
        className={`runway-scene${isRunwayLaunching ? ' runway-scene--takeoff' : ''}${showTakeoffCelebration ? ' runway-scene--celebrating' : ''}${runwayCardExiting ? ' runway-scene--exiting' : ''}`}
        aria-label="Trip readiness runway"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && event.animationName === 'runway-card-exit') {
            setShowTakeoffCelebration(false)
            setRunwayCardExiting(false)
            setShowRunwayCard(false)
          }
        }}
      >
        <div className="runway-heading" aria-live="polite">
          <div>
            <h2>{isRunwayLaunching ? 'Cleared for takeoff!' : 'Your runway is waiting'}</h2>
          </div>
          <span className="runway-status">{isRunwayLaunching ? 'ALL SYSTEMS GO' : 'COMPLETE YOUR TRIP PLANS'}</span>
        </div>
        <div className="runway-viewport">
          <RunwayScene3D
            launchTrigger={launchTrigger}
            onTakeoffComplete={() => setShowTakeoffCelebration(true)}
          />
          <button
            className="runway-test-button"
            type="button"
            aria-label="Test the airplane takeoff animation"
            onClick={() => setLaunchTestCount((count) => count + 1)}
          >
            <span aria-hidden="true">✈</span> Test takeoff
          </button>
        </div>
        {showTakeoffCelebration && (
          <div
            className="runway-celebration"
            role="status"
            aria-live="polite"
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && event.animationName === 'runway-celebration-wipe') {
                setRunwayCardExiting(true)
              }
            }}
          >
            <div className="runway-celebration-content">
              <span className="runway-thumbs-up" aria-hidden="true">👍</span>
              <span>You’re all set!</span>
            </div>
          </div>
        )}
      </section>}

      <footer className="footer">
        <span>waypoint <span className="footer-dot">✳</span></span>
        <span>YOUR JOURNEY, ORGANIZED.</span>
      </footer>
    </main>
  )
}

export default App
