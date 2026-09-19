import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import { GpsPoint, RouteData, VehicleStatus } from '../types';
import { CONFIG } from '../config';
import { Compass, Eye, EyeOff, Navigation, Layers, RotateCcw } from 'lucide-react';

interface MapLibre3DProps {
  latestGps: GpsPoint | null;
  activeRoute: RouteData | null;
  alternateRouteGeoJson: any | null;
  vehicleStatus: VehicleStatus;
  isDeviated: boolean;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  selectionMode?: 'A' | 'B' | 'C' | null;
  waypointSelections?: {
    pointA: { lat: number; lng: number } | null;
    pointB: { lat: number; lng: number } | null;
    pointC: { lat: number; lng: number } | null;
  };
}

export const MapLibre3D: React.FC<MapLibre3DProps> = ({
  latestGps,
  activeRoute,
  alternateRouteGeoJson,
  vehicleStatus,
  isDeviated,
  onMapClick,
  selectionMode,
  waypointSelections,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);

  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  const [followVehicle, setFollowVehicle] = useState<boolean>(true);
  const [is3DMode, setIs3DMode] = useState<boolean>(true);
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // Update canvas cursor and suspend camera-follow during point selection
  useEffect(() => {
    if (!mapRef.current) return;
    const canvas = mapRef.current.getCanvas();
    if (selectionMode) {
      canvas.style.cursor = 'crosshair';
      // Never snap camera back to vehicle while user is actively placing waypoints
      setFollowVehicle(false);
    } else {
      canvas.style.cursor = '';
    }
  }, [selectionMode]);

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter = latestGps
      ? [latestGps.longitude, latestGps.latitude]
      : CONFIG.DEFAULT_CENTER;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: CONFIG.MAP_STYLE_URL,
      center: initialCenter as [number, number],
      zoom: CONFIG.DEFAULT_ZOOM,
      pitch: CONFIG.DEFAULT_PITCH,
      bearing: CONFIG.DEFAULT_BEARING,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      // 1. Add 3D Building Extrusions layer if vector source exists
      const layers = map.getStyle().layers;
      const labelLayerId = layers?.find(
        (l) => l.type === 'symbol' && (l.layout as any)?.['text-field']
      )?.id;

      if (!map.getLayer('3d-buildings')) {
        map.addLayer(
          {
            id: '3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['get', 'render_height'],
                0, '#101a2d',
                50, '#1b2d4b',
                120, '#00f0ff',
              ],
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                14, 0,
                15.05, ['get', 'render_height'],
              ],
              'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                14, 0,
                15.05, ['get', 'render_min_height'],
              ],
              'fill-extrusion-opacity': 0.75,
            },
          },
          labelLayerId
        );
      }

      // 2. Setup Sources for Route Lines & Corridor
      // Route Corridor Buffer Source
      map.addSource('route-corridor', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'route-corridor-fill',
        type: 'fill',
        source: 'route-corridor',
        paint: {
          'fill-color': '#00f0ff',
          'fill-opacity': 0.12,
        },
      });
      map.addLayer({
        id: 'route-corridor-border',
        type: 'line',
        source: 'route-corridor',
        paint: {
          'line-color': '#00f0ff',
          'line-width': 1.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.4,
        },
      });

      // Primary Route Source
      map.addSource('primary-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // Route Outer Glow
      map.addLayer({
        id: 'primary-route-glow',
        type: 'line',
        source: 'primary-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0066ff',
          'line-width': 9,
          'line-opacity': 0.45,
          'line-blur': 4,
        },
      });
      // Route Main Line
      map.addLayer({
        id: 'primary-route-line',
        type: 'line',
        source: 'primary-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#00f0ff',
          'line-width': 4.5,
          'line-opacity': 0.95,
        },
      });

      // Alternate Route Source
      map.addSource('alternate-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'alternate-route-line',
        type: 'line',
        source: 'alternate-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffaa00',
          'line-width': 4,
          'line-dasharray': [3, 2],
          'line-opacity': 0.9,
        },
      });

      setMapLoaded(true);
    });

    // Map Click Handler for Route Point Selection
    map.on('click', (e) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    });

    // When the user drags or zooms manually, disengage camera follow so the map does not snap back
    map.on('dragstart', () => {
      setFollowVehicle(false);
    });

    map.on('zoomstart', (e: any) => {
      if (e.originalEvent) {
        setFollowVehicle(false);
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Route Geometry & Corridor Buffers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const primarySource = map.getSource('primary-route') as maplibregl.GeoJSONSource;
    const corridorSource = map.getSource('route-corridor') as maplibregl.GeoJSONSource;
    const alternateSource = map.getSource('alternate-route') as maplibregl.GeoJSONSource;

    // 1. Update Primary Route & Buffer
    if (activeRoute && activeRoute.route_geojson) {
      const geojsonLine = activeRoute.route_geojson;
      const feature: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: (geojsonLine as any).geometry || geojsonLine,
      };

      if (primarySource) {
        primarySource.setData({
          type: 'FeatureCollection',
          features: [feature],
        });
      }

      // Generate Corridor polygon buffer using Turf.js
      try {
        const corridorKm = CONFIG.ROUTE_DEVIATION_THRESHOLD_METERS / 1000;
        const buffered = turf.buffer(feature, corridorKm, { units: 'kilometers' });
        if (corridorSource && buffered) {
          corridorSource.setData(buffered);
        }
      } catch (err) {
        console.warn('Failed to calculate corridor buffer', err);
      }
    } else {
      if (primarySource) primarySource.setData({ type: 'FeatureCollection', features: [] });
      if (corridorSource) corridorSource.setData({ type: 'FeatureCollection', features: [] });
    }

    // 2. Update Alternate Route
    if (alternateRouteGeoJson && alternateSource) {
      const altFeature: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: alternateRouteGeoJson.geometry || alternateRouteGeoJson,
      };
      alternateSource.setData({
        type: 'FeatureCollection',
        features: [altFeature],
      });
    } else if (alternateSource) {
      alternateSource.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [activeRoute, alternateRouteGeoJson, mapLoaded]);

  // Update Waypoint Markers (A, B, C)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    // Clear existing waypoint markers
    waypointMarkersRef.current.forEach((m) => m.remove());
    waypointMarkersRef.current = [];

    const createWaypointEl = (label: string, color: string) => {
      const el = document.createElement('div');
      el.className = 'flex flex-col items-center cursor-pointer pointer-events-auto transform -translate-y-1/2';
      el.innerHTML = `
        <div class="px-2 py-1 rounded-md text-xs font-bold text-white shadow-lg border flex items-center justify-center gap-1"
             style="background: ${color}; border-color: rgba(255,255,255,0.4); box-shadow: 0 0 10px ${color}">
          <span>${label}</span>
        </div>
        <div class="w-1.5 h-3" style="background: ${color}"></div>
        <div class="w-2.5 h-2.5 rounded-full" style="background: ${color}"></div>
      `;
      return el;
    };

    // If modal is creating points, show waypoint selections
    if (waypointSelections?.pointA) {
      const el = createWaypointEl('POINT A', '#00f0ff');
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([waypointSelections.pointA.lng, waypointSelections.pointA.lat])
        .addTo(map);
      waypointMarkersRef.current.push(m);
    } else if (activeRoute) {
      const el = createWaypointEl('A', '#00f0ff');
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([activeRoute.origin_lng, activeRoute.origin_lat])
        .addTo(map);
      waypointMarkersRef.current.push(m);
    }

    if (waypointSelections?.pointB) {
      const el = createWaypointEl('POINT B', '#9933ff');
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([waypointSelections.pointB.lng, waypointSelections.pointB.lat])
        .addTo(map);
      waypointMarkersRef.current.push(m);
    } else if (activeRoute?.waypoints && activeRoute.waypoints.length > 0) {
      activeRoute.waypoints.forEach((wp, idx) => {
        const letter = String.fromCharCode(66 + idx); // B, C...
        const isEnd = idx === activeRoute.waypoints.length - 1;
        if (!isEnd) {
          const el = createWaypointEl(letter, '#9933ff');
          const m = new maplibregl.Marker({ element: el })
            .setLngLat(wp)
            .addTo(map);
          waypointMarkersRef.current.push(m);
        }
      });
    }

    if (waypointSelections?.pointC) {
      const el = createWaypointEl('POINT C', '#00ff66');
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([waypointSelections.pointC.lng, waypointSelections.pointC.lat])
        .addTo(map);
      waypointMarkersRef.current.push(m);
    } else if (activeRoute) {
      const el = createWaypointEl('C', '#00ff66');
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([activeRoute.destination_lng, activeRoute.destination_lat])
        .addTo(map);
      waypointMarkersRef.current.push(m);
    }
  }, [activeRoute, waypointSelections, mapLoaded]);

  // Create / Update Vehicle Marker & Follow Camera
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !latestGps) return;
    const map = mapRef.current;

    // Status styling for marker
    let glowColor = '#00f0ff';
    let ringClass = 'border-cyan-400 shadow-cyan-glow';
    let pulseBg = 'bg-cyan-500';

    if (isDeviated || vehicleStatus === 'DEVIATION') {
      glowColor = '#ff0055';
      ringClass = 'border-rose-500 shadow-rose-glow animate-ping';
      pulseBg = 'bg-rose-500';
    } else if (vehicleStatus === 'DELAYED') {
      glowColor = '#ffaa00';
      ringClass = 'border-amber-400 shadow-amber-glow';
      pulseBg = 'bg-amber-500';
    } else if (vehicleStatus === 'STALE' || vehicleStatus === 'OFFLINE') {
      glowColor = '#64748b';
      ringClass = 'border-slate-500';
      pulseBg = 'bg-slate-500';
    } else if (vehicleStatus === 'LIVE') {
      glowColor = '#00ff66';
      ringClass = 'border-emerald-400 shadow-lime-glow';
      pulseBg = 'bg-emerald-500';
    }

    const heading = latestGps.heading !== null ? latestGps.heading : 0;

    if (!markerRef.current) {
      // Build custom futuristic vehicle marker DOM element
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center pointer-events-auto cursor-pointer';
      el.style.width = '48px';
      el.style.height = '48px';
      el.innerHTML = `
        <div id="vehicle-pulse-ring" class="absolute w-12 h-12 rounded-full border-2 opacity-75 ${ringClass}"></div>
        <div id="vehicle-inner-dot" class="w-8 h-8 rounded-full bg-slate-950/90 border border-slate-700 shadow-xl flex items-center justify-center relative">
          <div id="vehicle-heading-arrow" class="transition-transform duration-300 ease-out" style="transform: rotate(${heading}deg);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${glowColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>
            </svg>
          </div>
          <div class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${pulseBg} border border-slate-900 animate-pulse"></div>
        </div>
      `;

      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([latestGps.longitude, latestGps.latitude])
        .addTo(map);
    } else {
      // Smoothly update marker position and rotation
      markerRef.current.setLngLat([latestGps.longitude, latestGps.latitude]);
      const arrowEl = markerRef.current.getElement().querySelector('#vehicle-heading-arrow') as HTMLElement;
      if (arrowEl) {
        arrowEl.style.transform = `rotate(${heading}deg)`;
        const svg = arrowEl.querySelector('svg');
        if (svg) svg.setAttribute('stroke', glowColor);
      }
      const ringEl = markerRef.current.getElement().querySelector('#vehicle-pulse-ring') as HTMLElement;
      if (ringEl) {
        ringEl.className = `absolute w-12 h-12 rounded-full border-2 opacity-75 ${ringClass}`;
      }
    }

    // Follow vehicle camera (only when enabled AND NOT in route selection mode)
    if (followVehicle && !selectionMode) {
      map.easeTo({
        center: [latestGps.longitude, latestGps.latitude],
        duration: 1200,
        pitch: is3DMode ? CONFIG.DEFAULT_PITCH : 0,
      });
    }
  }, [latestGps, vehicleStatus, isDeviated, followVehicle, selectionMode, is3DMode, mapLoaded]);

  // Toggle 2D / 3D mode
  const toggle3D = useCallback(() => {
    if (!mapRef.current) return;
    const new3D = !is3DMode;
    setIs3DMode(new3D);
    mapRef.current.easeTo({
      pitch: new3D ? CONFIG.DEFAULT_PITCH : 0,
      bearing: new3D ? CONFIG.DEFAULT_BEARING : 0,
      duration: 1000,
    });
  }, [is3DMode]);

  // Reset Camera View
  const resetCamera = useCallback(() => {
    if (!mapRef.current) return;
    const center = latestGps
      ? [latestGps.longitude, latestGps.latitude]
      : CONFIG.DEFAULT_CENTER;
    mapRef.current.flyTo({
      center: center as [number, number],
      zoom: CONFIG.DEFAULT_ZOOM,
      pitch: is3DMode ? CONFIG.DEFAULT_PITCH : 0,
      bearing: CONFIG.DEFAULT_BEARING,
      duration: 1500,
    });
  }, [latestGps, is3DMode]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Map Controls HUD */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setFollowVehicle(!followVehicle)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold backdrop-blur-md border transition-all shadow-lg ${
            followVehicle
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-cyan-glow'
              : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="Camera Follow Vehicle Mode"
        >
          {followVehicle ? <Eye size={15} /> : <EyeOff size={15} />}
          <span>{followVehicle ? 'FOLLOWING VEHICLE' : 'FREE EXPLORE'}</span>
        </button>

        <button
          type="button"
          onClick={toggle3D}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold backdrop-blur-md border transition-all shadow-lg ${
            is3DMode
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
              : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="Toggle 3D Buildings & Pitch"
        >
          <Layers size={15} />
          <span>{is3DMode ? '3D BUILDINGS ON' : '2D OVERHEAD'}</span>
        </button>

        <button
          type="button"
          onClick={resetCamera}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900/80 text-slate-400 border border-slate-700 hover:text-slate-200 backdrop-blur-md transition-all shadow-lg"
          title="Recenter Camera on Vehicle"
        >
          <RotateCcw size={15} />
          <span>RECENTER</span>
        </button>
      </div>
    </div>
  );
};
