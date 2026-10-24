import { StatusBadge } from './StatusBadge'

export interface HotelDetails {
  name: string
  location: string
  checkIn: string
  checkOut: string
  confirmation: string
  status: string
}

interface HotelBookingCardProps {
  hotel: HotelDetails
}

export function HotelBookingCard({ hotel }: HotelBookingCardProps) {
  return (
    <article className="booking-card">
      <div className="booking-header">
        <div className="booking-title">
          <span className="booking-icon hotel-icon">⌂</span>
          <div>
            <h3>Hotel &amp; accommodation</h3>
            <p>Your stay and reservation information</p>
          </div>
        </div>
        <StatusBadge status={hotel.status} />
      </div>

      <div className="hotel-placeholder">
        <div className="hotel-illustration">
          <div className="hotel-sun" />
          <div className="hotel-building">
            <div className="hotel-windows">
              {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
            </div>
            <div className="hotel-door" />
          </div>
          <div className="hotel-ground" />
        </div>

        <div className="hotel-info">
          <span className="section-kicker">YOUR ACCOMMODATION</span>
          <h3>{hotel.name}</h3>
          <p>{hotel.location}</p>
        </div>
      </div>

      <div className="details-grid hotel-details">
        <div className="detail-item"><span>Check-in</span><strong>{hotel.checkIn}</strong></div>
        <div className="detail-item"><span>Check-out</span><strong>{hotel.checkOut}</strong></div>
        <div className="detail-item"><span>Reservation status</span><strong>{hotel.status}</strong></div>
        <div className="detail-item"><span>Confirmation number</span><strong>---</strong></div>
      </div>

      <div className="booking-footer">
        <div>
          <span className="footer-label">BOOKING REFERENCE</span>
          <strong>{hotel.confirmation}</strong>
        </div>
        <span className="footer-symbol">↗</span>
      </div>
    </article>
  )
}
