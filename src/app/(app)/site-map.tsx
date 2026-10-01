"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { t } from "@/i18n/t";
import { forgetAuthFailure, loadGoogleMaps } from "@/lib/google-maps-loader";
import type { MapPin, MapPosition } from "@/registry/registry";
import { moveMapPin } from "./lokalizacje/actions";

/** Pinezka mapy budów z liczbą narzędzi z tablicy. */
export interface SiteMapPin extends MapPin {
  toolCount: number;
}

/** Klucz przeglądarki i identyfikator mapy Google (zob. `serverEnv.googleMaps`). */
export interface GoogleMapsConfig {
  apiKey: string;
  mapId: string;
}

type Status = "loading" | "ready" | "offline" | "failed";

/** Widok startowy, zanim firma ma jakąkolwiek pinezkę: cała Polska. */
const POLAND = { center: { lat: 52.07, lng: 19.48 }, zoom: 6 };
const SINGLE_PIN_ZOOM = 14;
const FIT_PADDING = 48;

const STATUS_TEXT: Record<Exclude<Status, "ready">, string> = {
  loading: t("siteMap.loading"),
  offline: t("siteMap.offline"),
  failed: t("siteMap.failed"),
};

function pinLabel(pin: MapPin) {
  return `${pin.kind === "baza" ? t("board.baseKind") : t("board.siteKind")}: ${pin.name}`;
}

/** Wygląd pinezki jak na mapie demo: liczba narzędzi budowy albo „B” bazy, pod spodem nazwa. */
function pinContent(pin: SiteMapPin, selected: boolean) {
  const element = document.createElement("span");
  element.className = `gmap-pin gmap-pin-${pin.kind === "baza" ? "base" : "site"}${selected ? " is-selected" : ""}`;
  const head = document.createElement("span");
  head.className = "map-pin-head";
  head.textContent = pin.kind === "baza" ? "B" : String(pin.toolCount);
  const label = document.createElement("span");
  label.className = "map-pin-label";
  label.textContent = pin.name;
  element.append(head, label);
  return element;
}

function positionOf(position: google.maps.marker.AdvancedMarkerElement["position"]): MapPosition | null {
  if (!position) return null;
  const { lat, lng } = "toJSON" in position ? position.toJSON() : position;
  return { lat, lng };
}

/** Przybliżenie obejmujące wszystkie pinezki; jedna stoi na środku, w skali ulic. */
async function fitTo(map: google.maps.Map, positions: MapPosition[]) {
  if (positions.length === 0) return;
  if (positions.length === 1) {
    map.setCenter(positions[0]);
    map.setZoom(SINGLE_PIN_ZOOM);
    return;
  }
  const { LatLngBounds } = (await google.maps.importLibrary("core")) as google.maps.CoreLibrary;
  const bounds = new LatLngBounds();
  for (const position of positions) bounds.extend(position);
  map.fitBounds(bounds, FIT_PADDING);
}

function Details({ pin, canEdit, onMove }: { pin: SiteMapPin | null; canEdit: boolean; onMove: (pin: SiteMapPin) => void }) {
  if (!pin) return <p className="muted">{canEdit ? t("siteMap.ownerHint") : t("siteMap.liveHint")}</p>;
  return (
    <div className="site-map-details">
      <strong>{pin.name}</strong>
      <span className="muted">{pin.address}</span>
      <span>{t("board.toolCount", { count: pin.toolCount })}</span>
      <a href={`#location-${pin.kind === "baza" ? "base" : pin.id}`}>{t("siteMap.openLocation")}</a>
      {canEdit && (
        <p>
          <button type="button" className="button button-quiet button-small" onClick={() => onMove(pin)}>
            {t("siteMap.movePin")}
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Mapa budów prawdziwej firmy na Google Maps: baza z adresem i aktywne budowy w miejscu swojego adresu (albo tam,
 * gdzie właściciel postawił pinezkę). Właściciel przeciąga pinezkę albo wskazuje miejsce kliknięciem. Budowy bez
 * położenia są pod mapą. Bez sieci mapa mówi, że jej potrzebuje, a reszta tablicy działa dalej (ADR 0010).
 */
export function SiteMap({ pins, maps, canEdit }: { pins: SiteMapPin[]; maps: GoogleMapsConfig; canEdit: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const fitted = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const save = (pin: SiteMapPin, position: MapPosition) => {
    setError(null);
    setPlacingId(null);
    startSaving(async () => {
      const result = await moveMapPin(pin.id, position);
      if (!result.error) return;
      setError(result.error);
      // Odmowa: pinezka wraca tam, gdzie stała.
      const marker = markers.current.get(pin.id);
      if (marker && pin.position) marker.position = pin.position;
    });
  };
  // Słuchacze Google żyją dłużej niż jeden render, więc czytają bieżący stan stąd.
  const latest = useRef({ pins, placingId, selectedId, save });
  useEffect(() => {
    latest.current = { pins, placingId, selectedId, save };
  });

  useEffect(() => {
    let cancelled = false;
    let clickListener: google.maps.MapsEventListener | undefined;
    const onAuthFailure = () => setStatus("failed");
    const start = async () => {
      if (!navigator.onLine) return setStatus("offline");
      setStatus("loading");
      try {
        await loadGoogleMaps(maps.apiKey, onAuthFailure);
        const { Map } = (await google.maps.importLibrary("maps")) as google.maps.MapsLibrary;
        if (cancelled || !container.current || map.current) return;
        map.current = new Map(container.current, {
          ...POLAND,
          mapId: maps.mapId,
          gestureHandling: "cooperative",
          clickableIcons: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
        clickListener = map.current.addListener("click", (event: google.maps.MapMouseEvent) => {
          const { pins, placingId, save } = latest.current;
          const pin = pins.find((candidate) => candidate.id === placingId);
          if (pin && event.latLng) save(pin, event.latLng.toJSON());
        });
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus(navigator.onLine ? "failed" : "offline");
      }
    };
    void start();
    const retry = () => {
      if (!map.current) void start();
    };
    window.addEventListener("online", retry);
    const placedMarkers = markers.current;
    return () => {
      cancelled = true;
      window.removeEventListener("online", retry);
      forgetAuthFailure(onAuthFailure);
      clickListener?.remove();
      for (const marker of placedMarkers.values()) marker.map = null;
      placedMarkers.clear();
      map.current = null;
      fitted.current = false;
    };
  }, [maps.apiKey, maps.mapId]);

  useEffect(() => {
    if (status !== "ready") return;
    let cancelled = false;
    void (async () => {
      const { AdvancedMarkerElement } = (await google.maps.importLibrary("marker")) as google.maps.MarkerLibrary;
      if (cancelled || !map.current) return;
      const placed = pins.filter((pin): pin is SiteMapPin & { position: MapPosition } => pin.position !== null);
      for (const [id, marker] of markers.current) {
        if (!placed.some((pin) => pin.id === id)) {
          marker.map = null;
          markers.current.delete(id);
        }
      }
      for (const pin of placed) {
        const existing = markers.current.get(pin.id);
        if (existing) {
          existing.position = pin.position;
          existing.content = pinContent(pin, pin.id === latest.current.selectedId);
          existing.gmpDraggable = canEdit;
          continue;
        }
        const marker = new AdvancedMarkerElement({
          map: map.current,
          position: pin.position,
          title: pinLabel(pin),
          content: pinContent(pin, pin.id === latest.current.selectedId),
          gmpDraggable: canEdit,
        });
        marker.addListener("click", () => setSelectedId((current) => (current === pin.id ? null : pin.id)));
        marker.addListener("dragend", () => {
          const current = latest.current.pins.find((candidate) => candidate.id === pin.id);
          const position = positionOf(marker.position);
          if (current && position) latest.current.save(current, position);
        });
        markers.current.set(pin.id, marker);
      }
      // Widok startowy dopasowuje się raz, do pierwszych pinezek; potem zostaje taki, jak ustawił go użytkownik.
      if (!fitted.current && placed.length > 0) {
        fitted.current = true;
        await fitTo(map.current, placed.map((pin) => pin.position));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, pins, canEdit]);

  // Zaznaczenie zmienia tylko wygląd pinezek, nie ich położenie (przeciągnięta czeka na zapis).
  useEffect(() => {
    for (const pin of pins) {
      const marker = markers.current.get(pin.id);
      if (!marker) continue;
      marker.content = pinContent(pin, pin.id === selectedId);
      marker.zIndex = pin.id === selectedId ? 1 : null;
    }
  }, [pins, selectedId]);

  const selected = pins.find((pin) => pin.id === selectedId) ?? null;
  const placing = pins.find((pin) => pin.id === placingId) ?? null;
  const unplaced = pins.filter((pin) => pin.position === null);

  return (
    <section className="board-section" aria-labelledby="board-map">
      <div className="section-head">
        <h2 id="board-map" className="display section-title">
          {t("siteMap.title")}
        </h2>
        <ul className="map-legend">
          <li>
            <span className="map-legend-mark map-legend-site" /> {t("siteMap.legendSites")}
          </li>
          <li>
            <span className="map-legend-mark map-legend-base" /> {t("siteMap.legendBase")}
          </li>
        </ul>
      </div>
      <div className="location site-map">
        <div className="site-map-canvas" data-map-status={status} aria-busy={status === "loading" || saving}>
          <div ref={container} className="site-map-google" />
          {status !== "ready" && <p className="site-map-status">{STATUS_TEXT[status]}</p>}
        </div>
        {placing && (
          <p role="status" className="site-map-placing">
            {t("siteMap.placing", { name: placing.name })}{" "}
            <button type="button" className="button button-quiet button-small" onClick={() => setPlacingId(null)}>
              {t("siteMap.cancelPlacing")}
            </button>
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div aria-live="polite">
          <Details pin={selected} canEdit={canEdit && status === "ready"} onMove={(pin) => setPlacingId(pin.id)} />
        </div>
        {unplaced.length > 0 && (
          <div className="site-map-unplaced">
            <h3 className="location-kind">{t("siteMap.unplacedTitle")}</h3>
            <ul>
              {unplaced.map((pin) => (
                <li key={pin.id}>
                  <span>
                    <strong>{pin.name}</strong> <span className="muted">{pin.address}</span>
                  </span>
                  {canEdit && status === "ready" && (
                    <button type="button" className="button button-quiet button-small" onClick={() => setPlacingId(pin.id)}>
                      {t("siteMap.placeOnMap")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted site-map-note">{canEdit ? t("siteMap.unplacedOwnerHint") : t("siteMap.unplacedHint")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
