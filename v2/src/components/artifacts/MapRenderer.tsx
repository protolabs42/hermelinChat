/**
 * MapRenderer — react-leaflet map for artifact type "map".
 *
 * Data schema (artifact.data) — every position field is permissive:
 * {
 *   center?: Position,          // see Position below; default: fit bounds or [0, 0]
 *   zoom?: number,              // default: derived from content
 *   markers?: Array<MarkerInput>,
 *   geojson?: object,           // any GeoJSON FeatureCollection/Feature
 *   tiles?: "dark" | "light" | "osm" | string  // preset or custom tile url
 * }
 *
 * Position accepted shapes (anywhere a position is needed):
 *   - [lat, lng]                                  // tuple
 *   - { lat, lng }
 *   - { lat, lon }
 *   - { latitude, longitude }
 *
 * MarkerInput accepted shapes:
 *   - { position: Position, title?, description?, name?, label? }
 *   - { lat, lng, ... }                           // marker is itself a Position
 *   - Any of the alternative position field names above
 *
 * Invalid markers are silently skipped with a console.warn so one bad row
 * never crashes the whole map.
 *
 * Uses CartoDB basemaps (no API key) — Dark Matter for dark themes, Positron for light.
 */

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTheme } from '../../theme'

// Side-effect imports — leaflet CSS is global, marker icons need manual wiring
// because bundlers don't resolve the default image URLs from the CSS.
import 'leaflet/dist/leaflet.css'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

// Patch Leaflet's default icon once, globally.
// (Leaflet's default icon resolver uses a broken URL scheme under bundlers.)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl })

type LatLngTuple = [number, number]

interface NormalizedMarker {
  position: LatLngTuple
  title?: string
  description?: string
}

interface MapData {
  center?: unknown
  zoom?: number
  markers?: unknown[]
  geojson?: GeoJSON.GeoJsonObject
  tiles?: string
}

/**
 * Permissive position parser. Returns a valid [lat, lng] tuple or null if the
 * input doesn't look like a position. Lat must be in [-90, 90] and lng in
 * [-180, 180]; values outside the range are rejected so we don't pass garbage
 * to leaflet.
 */
function parsePosition(input: unknown): LatLngTuple | null {
  if (input == null) return null

  // Tuple form: [lat, lng]
  if (Array.isArray(input) && input.length >= 2) {
    const lat = Number(input[0])
    const lng = Number(input[1])
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return [lat, lng]
    }
    return null
  }

  // Object form with various field names
  if (typeof input === 'object') {
    const o = input as Record<string, unknown>
    const lat = Number(o.lat ?? o.latitude)
    const lng = Number(o.lng ?? o.lon ?? o.long ?? o.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return [lat, lng]
    }
  }

  return null
}

/**
 * Parse a marker entry. Accepts either an explicit `position` field
 * or a flat object that's itself a position with extra metadata.
 */
function parseMarker(input: unknown): NormalizedMarker | null {
  if (input == null) return null
  const o = (typeof input === 'object' ? input : {}) as Record<string, unknown>

  // First try the explicit position field
  let pos = parsePosition(o.position)
  // Fall back to treating the marker itself as a position
  if (!pos) pos = parsePosition(input)
  if (!pos) return null

  const title =
    typeof o.title === 'string' ? o.title :
    typeof o.name === 'string' ? o.name :
    typeof o.label === 'string' ? o.label :
    undefined

  const description =
    typeof o.description === 'string' ? o.description :
    typeof o.desc === 'string' ? o.desc :
    typeof o.popup === 'string' ? o.popup :
    undefined

  return { position: pos, title, description }
}

const TILE_PRESETS: Record<string, { url: string; attribution: string }> = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
}

function isDarkBg(hex: string): boolean {
  // Rough luminance check: if the theme bg is darker than midgrey, use dark tiles.
  const m = hex.replace('#', '').match(/.{1,2}/g)
  if (!m || m.length < 3) return true
  const [r, g, b] = m.map((x) => parseInt(x, 16))
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128
}

/** FitToBounds child — recalculates view bounds on data changes. */
function FitBounds({
  markers,
  geojson,
}: {
  markers: NormalizedMarker[]
  geojson?: GeoJSON.GeoJsonObject
}) {
  const map = useMap()
  useEffect(() => {
    if (geojson) {
      try {
        const layer = L.geoJSON(geojson as GeoJSON.GeoJsonObject)
        const b = layer.getBounds()
        if (b.isValid()) {
          map.fitBounds(b, { padding: [24, 24], maxZoom: 15 })
          return
        }
      } catch {
        /* ignore */
      }
    }
    if (markers.length > 0) {
      try {
        const bounds = L.latLngBounds(markers.map((m) => m.position))
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
      } catch {
        /* ignore */
      }
    }
  }, [map, markers, geojson])
  return null
}

export default function MapRenderer({ data }: { data: unknown }) {
  const { theme } = useTheme()
  const d = (data || {}) as MapData

  // Pick tile preset based on requested value, falling back to theme-driven dark/light
  const tile = useMemo(() => {
    if (d.tiles && TILE_PRESETS[d.tiles]) return TILE_PRESETS[d.tiles]
    if (d.tiles) return { url: d.tiles, attribution: '' }
    return isDarkBg(theme.colors.bg) ? TILE_PRESETS.dark : TILE_PRESETS.light
  }, [d.tiles, theme])

  // Normalize markers — drop anything we can't parse, log dropped count
  const markers = useMemo<NormalizedMarker[]>(() => {
    if (!Array.isArray(d.markers)) return []
    const valid: NormalizedMarker[] = []
    let dropped = 0
    for (const raw of d.markers) {
      const m = parseMarker(raw)
      if (m) valid.push(m)
      else dropped++
    }
    if (dropped > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[MapRenderer] dropped ${dropped} marker(s) with unparseable position`, d.markers)
    }
    return valid
  }, [d.markers])

  const parsedCenter = useMemo(() => parsePosition(d.center), [d.center])

  const center: LatLngTuple = parsedCenter || markers[0]?.position || [20, 0]
  const zoom = d.zoom ?? (markers.length > 0 ? 10 : 2)

  const hasContent = markers.length > 0 || !!d.geojson || !!parsedCenter

  if (!hasContent) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 12, color: 'var(--color-text-bright)' }}>Map</div>
        <div style={{ fontSize: 12, opacity: 0.7, color: 'var(--color-muted)' }}>
          Provide center, markers, or geojson
        </div>
        {Array.isArray(d.markers) && d.markers.length > 0 && (
          <div style={{ fontSize: 11, opacity: 0.5, color: 'var(--color-muted)', marginTop: 8 }}>
            ({d.markers.length} marker{d.markers.length === 1 ? '' : 's'} could not be parsed — check console)
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ height: '100%', width: '100%', background: theme.colors.bg }}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', background: theme.colors.bg }}
      >
        <TileLayer url={tile.url} attribution={tile.attribution} />
        {markers.map((m, i) => (
          <Marker key={i} position={m.position}>
            {(m.title || m.description) && (
              <Popup>
                {m.title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{m.title}</div>}
                {m.description && <div style={{ fontSize: 12 }}>{m.description}</div>}
              </Popup>
            )}
          </Marker>
        ))}
        {d.geojson && <GeoJSON data={d.geojson} style={() => ({ color: theme.colors.accent, weight: 2 })} />}
        <FitBounds markers={markers} geojson={d.geojson} />
      </MapContainer>
    </div>
  )
}

const emptyStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 32,
  textAlign: 'center',
  color: 'var(--color-muted)',
}
