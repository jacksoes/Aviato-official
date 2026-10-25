import { StatusBadge } from './StatusBadge'

export interface FlightDetails {
  airline: string
  flightNumber: string
  departure: string
  arrival: string
  departureTime: string
  arrivalTime: string
  confirmation: string
  status: string
  departureCode?: string
  arrivalCode?: string
  date?: string
}

interface FlightBookingCardProps {
  flight: FlightDetails
}

export function FlightBookingCard({ flight }: FlightBookingCardProps) {
  const hasFlight = flight.flightNumber !== '—'

  return (
    <article className={`booking-card${hasFlight ? ' booking-card--decided' : ''}`}>
      <div className="booking-header">
        <div className="booking-title">
          <span className="booking-icon flight-icon">✈</span>
          <div>
            <h3>Flights &amp; tickets</h3>
            <p>Flight details approved by your AI agent</p>
          </div>
        </div>
        <StatusBadge status={flight.status} />
      </div>

      {!hasFlight ? (
        <p className="flight-lookup-hint">When you approve a flight with the AI agent, its verified details will appear here.</p>
      ) : (
        <>
          <div className="flight-route">
            <div className="airport">
              <span className="airport-code">{flight.departureCode || '---'}</span>
              <span>{flight.departure}</span>
            </div>

            <div className="route-visual">
              <span className="route-line" />
              <span className="route-plane">✈</span>
              <span className="route-line" />
              <span className="route-caption">{flight.status.toUpperCase()}</span>
            </div>

            <div className="airport airport-right">
              <span className="airport-code">{flight.arrivalCode || '---'}</span>
              <span>{flight.arrival}</span>
            </div>
          </div>

          <div className="details-grid">
            <div className="detail-item"><span>Airline</span><strong>{flight.airline}</strong></div>
            <div className="detail-item"><span>Flight number</span><strong>{flight.flightNumber}</strong></div>
            <div className="detail-item"><span>Flight date</span><strong>{flight.date || 'Date unavailable'}</strong></div>
            <div className="detail-item"><span>Departure</span><strong>{flight.departureTime}</strong></div>
            <div className="detail-item"><span>Arrival</span><strong>{flight.arrivalTime}</strong></div>
          </div>

          <div className="booking-footer">
            <div>
              <span className="footer-label">FLIGHT DATA</span>
              <strong>{flight.confirmation}</strong>
            </div>
            <span className="footer-symbol">✓</span>
          </div>
        </>
      )}
    </article>
  )
}
