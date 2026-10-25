import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Sky, Sparkles } from '@react-three/drei'
import type { Group } from 'three'

interface RunwayScene3DProps {
  launchTrigger: number
}

const runwayDashes = Array.from({ length: 15 }, (_, index) => -12.5 + index * 1.8)

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return reducedMotion
}

function AirportRunway() {
  return (
    <group rotation={[0, 0, 0]}>
      <mesh position={[0, -0.43, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[180, 100]} />
        <meshStandardMaterial color="#bd8c70" roughness={1} />
      </mesh>
      <mesh position={[0, -0.2, 0]} receiveShadow castShadow>
        <boxGeometry args={[34, 0.34, 8]} />
        <meshStandardMaterial color="#66615f" roughness={0.92} />
      </mesh>
      <mesh position={[0, -0.035, 0]} receiveShadow>
        <boxGeometry args={[32, 0.025, 7.25]} />
        <meshStandardMaterial color="#3f4549" roughness={0.82} metalness={0.08} />
      </mesh>

      {runwayDashes.map((x) => (
        <mesh key={`dash-${x}`} position={[x, -0.012, 0]}>
          <boxGeometry args={[0.95, 0.025, 0.19]} />
          <meshStandardMaterial color="#fffaf0" emissive="#b9b0a0" emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  )
}

function Airliner({ launchTrigger, reducedMotion }: RunwayScene3DProps & { reducedMotion: boolean }) {
  const aircraft = useRef<Group | null>(null)
  const landingGear = useRef<Group | null>(null)
  const progress = useRef(0)

  useEffect(() => {
    progress.current = launchTrigger > 0 && reducedMotion ? 0.84 : 0
  }, [launchTrigger, reducedMotion])

  useFrame((_, delta) => {
    if (!aircraft.current) return

    if (launchTrigger > 0 && !reducedMotion && progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta / 5.2)
    }

    const amount = launchTrigger > 0 ? progress.current : 0
    const travel = amount * amount * (3 - 2 * amount)
    const liftoff = Math.max(0, Math.min(1, (amount - 0.7) / 0.3))
    aircraft.current.position.set(-12.75 + travel * 31.5, 0.55 + liftoff * liftoff * 9, 0)
    aircraft.current.rotation.set(0, 0, liftoff * 0.2)
    const scale = 0.78 - amount * 0.2 + liftoff * 0.1
    aircraft.current.scale.setScalar(scale)
    if (landingGear.current) landingGear.current.scale.setScalar(Math.max(0, 1 - liftoff * 1.8))
  })

  return (
    <group ref={aircraft} position={[-12.75, 0.55, 0]}>
      {/* A twin-engine commercial airliner assembled from polished 3D shapes. */}
      <mesh position={[-0.05, 0.08, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <capsuleGeometry args={[0.34, 5.6, 10, 20]} />
        <meshStandardMaterial color="#ffffff" metalness={0.24} roughness={0.23} />
      </mesh>
      <mesh position={[3.1, 0.08, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <coneGeometry args={[0.34, 0.88, 20]} />
        <meshStandardMaterial color="#f8fbff" metalness={0.2} roughness={0.2} />
      </mesh>
      <mesh position={[-0.35, 0.03, 0]} castShadow>
        <boxGeometry args={[1.08, 0.16, 10.8]} />
        <meshStandardMaterial color="#f8fbff" metalness={0.18} roughness={0.28} />
      </mesh>
      <mesh position={[-2.55, 0.1, 0]} castShadow>
        <boxGeometry args={[0.72, 0.12, 4.1]} />
        <meshStandardMaterial color="#ffffff" metalness={0.18} roughness={0.28} />
      </mesh>
      <mesh position={[-2.65, 0.72, 0]} castShadow>
        <boxGeometry args={[0.92, 1.34, 0.18]} />
        <meshStandardMaterial color="#fffdf8" metalness={0.16} roughness={0.3} />
      </mesh>
      {[-2.55, 2.55].map((z) => (
        <group key={`engine-${z}`} position={[-0.2, -0.2, z]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.43, 0.48, 1.65, 24]} />
            <meshStandardMaterial color="#f5f8fc" metalness={0.5} roughness={0.26} />
          </mesh>
          <mesh position={[0.84, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.34, 0.065, 10, 24]} />
            <meshStandardMaterial color="#263747" metalness={0.55} roughness={0.24} />
          </mesh>
          <mesh position={[0.85, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <circleGeometry args={[0.28, 20]} />
            <meshStandardMaterial color="#667985" metalness={0.35} roughness={0.4} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={`windows-${side}`}>
          {Array.from({ length: 14 }, (_, index) => (
            <mesh key={`window-${side}-${index}`} position={[-2.25 + index * 0.34, 0.27, side * 0.315]} scale={[0.095, 0.075, 0.028]}>
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial color="#496579" metalness={0.35} roughness={0.18} />
            </mesh>
          ))}
          <mesh position={[-0.02, 0.02, side * 0.34]}>
            <boxGeometry args={[5.1, 0.045, 0.025]} />
            <meshStandardMaterial color="#9eb8ca" metalness={0.22} roughness={0.32} />
          </mesh>
        </group>
      ))}
      <mesh position={[2.7, 0.34, 0]} scale={[0.55, 0.2, 0.3]}>
        <sphereGeometry args={[1, 18, 14]} />
        <meshStandardMaterial color="#263b50" metalness={0.42} roughness={0.16} />
      </mesh>
      <group ref={landingGear}>
        {[-1.15, 1.15].map((z) => (
          <group key={`main-gear-${z}`} position={[-0.75, 0.07, z]}>
            <mesh position={[0, -0.24, 0]}>
              <boxGeometry args={[0.1, 0.52, 0.1]} />
              <meshStandardMaterial color="#dce5ed" metalness={0.52} roughness={0.28} />
            </mesh>
            <mesh position={[0, -0.48, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.13, 14]} />
              <meshStandardMaterial color="#252a30" roughness={0.78} />
            </mesh>
          </group>
        ))}
        <group position={[2.15, 0.07, 0]}>
          <mesh position={[0, -0.24, 0]}>
            <boxGeometry args={[0.09, 0.5, 0.09]} />
            <meshStandardMaterial color="#dce5ed" metalness={0.52} roughness={0.28} />
          </mesh>
          <mesh position={[0, -0.47, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.12, 14]} />
            <meshStandardMaterial color="#252a30" roughness={0.78} />
          </mesh>
        </group>
      </group>
      {[-5.25, 5.25].map((z) => (
        <mesh key={`nav-${z}`} position={[-0.35, 0.12, z]}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshStandardMaterial
            color={z < 0 ? '#ff5b58' : '#65ffd2'}
            emissive={z < 0 ? '#ff3838' : '#39ffd1'}
            emissiveIntensity={3}
          />
        </mesh>
      ))}
    </group>
  )
}

function AirportScene({ launchTrigger, reducedMotion }: RunwayScene3DProps & { reducedMotion: boolean }) {
  return (
    <>
      <color attach="background" args={['#e7a17f']} />
      <fog attach="fog" args={['#e7a17f', 24, 52]} />
      <Sky distance={450000} sunPosition={[8, 3, -10]} inclination={0.49} azimuth={0.25} rayleigh={1.7} turbidity={8} />
      <ambientLight intensity={0.8} color="#fff0dd" />
      <hemisphereLight args={['#d9eaff', '#a86d51', 1.15]} />
      <directionalLight
        castShadow
        position={[-6, 12, 7]}
        color="#fff1d7"
        intensity={2.5}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[8, 5, -6]} color="#ffb06f" intensity={38} distance={28} />
      <group scale={0.85}>
        <Sparkles count={26} size={1.5} scale={[27, 5, 13]} position={[0, 4, -3]} speed={reducedMotion ? 0 : 0.16} opacity={0.42} color="#fff1d2" />

        <mesh position={[0, -0.62, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#b77f62" roughness={1} />
        </mesh>
        <AirportRunway />
        <Airliner launchTrigger={launchTrigger} reducedMotion={reducedMotion} />
      </group>
    </>
  )
}

export function RunwayScene3D({ launchTrigger }: RunwayScene3DProps) {
  const reducedMotion = usePrefersReducedMotion()

  return (
    <Canvas
      className="runway-canvas"
      aria-hidden="true"
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 2.3, 13], fov: 39, zoom: 1.6896, near: 0.1, far: 120 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      fallback={<div className="runway-canvas-fallback">Aviato runway scene</div>}
    >
      <AirportScene launchTrigger={launchTrigger} reducedMotion={reducedMotion} />
    </Canvas>
  )
}
