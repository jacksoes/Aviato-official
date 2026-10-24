import { useState, type FormEvent } from 'react'
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
}

export interface FlightLookupInput {
  flightNumber?: string
  departure?: string
  arrival?: string
  date: string
}

interface FlightBookingCardProps {
  flight: FlightDetails
  onLookup: (input: FlightLookupInput) => Promise<FlightDetails[]>
  onSelectFlight: (flight: FlightDetails) => void
}

export function FlightBookingCard({ flight, onLookup, onSelectFlight }: FlightBookingCardProps) {
  const [flightNumber, setFlightNumber] = useState('B6 1023')
  const [departure, setDeparture] = useState('JFK')
  const [arrival, setArrival] = useState('LAX')
  const [date, setDate] = useState('2026-10-26')
  const [matches, setMatches] = useState<FlightDetails[]>([])
  const [selectedMatch, setSelectedMatch] = useState('')
  const [loading, setLoading] = useState(false)
  const [lookupMessage, setLookupMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setLookupMessage('Searching flight data…')
    setMatches([])
    try {
      const results = await onLookup({
        ...(flightNumber.trim() ? { flightNumber: flightNumber.trim() } : {}),
        ...(departure.trim() ? { departure: departure.trim() } : {}),
        ...(arrival.trim() ? { arrival: arrival.trim() } : {}),
        date,
      })
      setMatches(results)
      if (results.length === 1) {
        onSelectFlight(results[0])
        setLookupMessage('Flight found and added.')
      } else if (results.length > 1) {
        setSelectedMatch('0')
        onSelectFlight(results[0])
        setLookupMessage(`${results.length} flights found. Select the right flight below.`)
      } else {
        setLookupMessage('No matching flights found. Check the details and try again.')
      }
    } catch (error) {
      setLookupMessage(error instanceof Error ? error.message : 'Flight lookup failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <article className="booking-card">
      <div className="booking-header">
        <div className="booking-title">
          <span className="booking-icon flight-icon">✈</span>
          <div>
            <h3>Flights &amp; tickets</h3>
            <p>Airline and flight information</p>
          </div>
        </div>
        <StatusBadge status={flight.status} />
      </div>

      <form className="flight-lookup" onSubmit={handleSubmit}>
        <p className="flight-lookup-hint">Enter the flight number, or search by route. Date is required.</p>
        <label>
          Flight number <span>(optional)</span>
          <input value={flightNumber} onChange={(event) => setFlightNumber(event.target.value)} placeholder="e.g. DL 123" />
        </label>
        <div className="flight-lookup-route">
          <label>
            From <span>(IATA airport code)</span>
            <input value={departure} onChange={(event) => setDeparture(event.target.value.toUpperCase())} placeholder="JFK" maxLength={4} />
          </label>
          <label>
            To <span>(IATA airport code)</span>
            <input value={arrival} onChange={(event) => setArrival(event.target.value.toUpperCase())} placeholder="LAX" maxLength={4} />
          </label>
          <label>
            Flight date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
        </div>
        <div className="flight-lookup-actions">
          <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Find flight'}</button>
          {lookupMessage && <span role="status">{lookupMessage}</span>}
        </div>
        {matches.length > 1 && (
          <label className="flight-match-select">
            Matching flights
            <select value={selectedMatch} onChange={(event) => {
              setSelectedMatch(event.target.value)
              onSelectFlight(matches[Number(event.target.value)])
            }}>
              {matches.map((match, index) => (
                <option key={`${match.flightNumber}-${index}`} value={index}>
                  {match.flightNumber}: {match.departureCode} → {match.arrivalCode} · {match.departureTime}
                </option>
              ))}
            </select>
          </label>
        )}
      </form>

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
        <div className="detail-item"><span>Departure</span><strong>{flight.departureTime}</strong></div>
        <div className="detail-item"><span>Arrival</span><strong>{flight.arrivalTime}</strong></div>
      </div>

      <div className="booking-footer">
        <div>
          <span className="footer-label">FLIGHT TRACKING</span>
          <strong>{flight.confirmation}</strong>
        </div>
        <span className="footer-symbol">↗</span>
      </div>
    </article>
  )
}
