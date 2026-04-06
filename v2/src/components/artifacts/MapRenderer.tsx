/**
 * MapRenderer — react-leaflet map for artifact type "map".
 *
 * Data schema (artifact.data):
 * {
 *   center?: [lat, lng],        // default: fit bounds or [0, 0]
 *   zoom?: number,              // default: 13
 *   markers?: Array<{
 *     position: [lat, lng],
 *     title?: string,
 *     description?: string,
 *   }>,
 *   geojson?: object,           // any GeoJSON FeatureCollection/Feature
 *   tiles?: "dark" | "light" | "osm" | string  // preset or custom tile url
 * }
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

interface MapMarker {
  position: [number, number]
  title?: string
  description?: string
}

interface MapData {
  center?: [number, number]
  zoom?: number
  markers?: MapMarker[]
  geojson?: GeoJSON.GeoJsonObject
  tiles?: string
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
function FitBounds({ markers, geojson }: { markers?: MapMarker[]; geojson?: GeoJSON.GeoJsonObject }) {
  const map = useMap()
  useEffect(() => {
    const group: L.LatLngExpression[] = []
    for (const m of markers || []) group.push(m.position)
    if (geojson) {
      // Let Leaflet compute bounds for the geojson layer
      try {
        const layer = L.geoJSON(geojson as GeoJSON.GeoJsonObject)
        const b = layer.getBounds()
        if (b.isValid()) {
          map.fitBounds(b, { padding: [24, 24], maxZoom: 15 })
          return
        }
      } catch { /* ignore */ }
    }
    if (group.length > 0) {
      const bounds = L.latLngBounds(group)
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
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

  const center: [number, number] = d.center || (d.markers && d.markers[0]?.position) || [20, 0]
  const zoom = d.zoom ?? (d.markers && d.markers.length > 0 ? 10 : 2)

  const hasContent = (d.markers && d.markers.length > 0) || !!d.geojson || !!d.center

  if (!hasContent) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 12, color: 'var(--color-text-bright)' }}>Map</div>
        <div style={{ fontSize: 12, opacity: 0.7, color: 'var(--color-muted)' }}>
          Provide center, markers, or geojson
        </div>
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
        {(d.markers || []).map((m, i) => (
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
        <FitBounds markers={d.markers} geojson={d.geojson} />
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
