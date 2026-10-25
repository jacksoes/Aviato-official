import { useEffect, useState } from 'react'
import stateMapSvg from '../assets/us-states.svg?raw'

// Boundary paths are from Wikimedia Commons' "Blank US Map (states only).svg" (CC0 1.0).

type UsState = { code: string; name: string }

const US_STATES: UsState[] = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]

const STATE_PATHS = new Map<string, string>()
for (const match of stateMapSvg.matchAll(/<path class="([a-z]{2})" d="([^"]+)"/g)) {
  STATE_PATHS.set(match[1].toUpperCase(), match[2])
}

export function findUsState(destination: string | null): UsState | null {
  if (!destination?.trim()) return null
  const normalized = destination.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const locationParts = destination.split(/[,;|/]/).map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
  for (const part of locationParts) {
    const statePart = US_STATES.find(({ name, code }) => part === name.toLowerCase() || part === code.toLowerCase())
    if (statePart) return statePart
  }

  const stateByName = US_STATES.find(({ name }) => {
    const normalizedName = name.toLowerCase()
    return normalized === normalizedName || normalized.endsWith(` ${normalizedName}`)
  })
  if (stateByName) return stateByName

  const lastToken = normalized.split(' ').at(-1)?.toUpperCase()
  return US_STATES.find(({ code }) => code === lastToken) ?? null
}

interface DestinationStateOutlineProps {
  state: UsState
}

export function DestinationStateOutline({ state }: DestinationStateOutlineProps) {
  const pathData = STATE_PATHS.get(state.code)
  const [viewBox, setViewBox] = useState<string | null>(null)

  useEffect(() => {
    setViewBox(null)
    if (!pathData) {
      return
    }

    const namespace = 'http://www.w3.org/2000/svg'
    const measuringSvg = document.createElementNS(namespace, 'svg')
    measuringSvg.setAttribute('viewBox', '0 0 959 593')
    measuringSvg.style.position = 'fixed'
    measuringSvg.style.left = '-2000px'
    measuringSvg.style.top = '0'
    measuringSvg.style.width = '959px'
    measuringSvg.style.height = '593px'
    measuringSvg.style.visibility = 'hidden'

    const path = document.createElementNS(namespace, 'path')
    path.setAttribute('d', pathData)
    measuringSvg.append(path)
    document.body.append(measuringSvg)

    const bounds = path.getBBox()
    measuringSvg.remove()
    const padding = Math.max(bounds.width, bounds.height) * 0.06
    setViewBox(`${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`)

    return () => measuringSvg.remove()
  }, [pathData])

  if (!pathData || !viewBox) return null

  return (
    <div className="destination-state-art" aria-hidden="true">
      <span className="state-art-sparkle state-art-sparkle-one">✦</span>
      <span className="state-art-sparkle state-art-sparkle-two">✧</span>
      <div className="state-art-halo" />
      <svg className="state-outline-svg" viewBox={viewBox} role="img" aria-label={`${state.name} outline`}>
        <path d={pathData} />
      </svg>
      <span className="state-art-caption">YOUR DESTINATION</span>
      <strong className="state-art-name">{state.name}</strong>
    </div>
  )
}
