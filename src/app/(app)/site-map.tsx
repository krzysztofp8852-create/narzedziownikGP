"use client";

import Link from "next/link";
import { useState } from "react";
import { VehicleIcon } from "@/components/vehicle-icon";
import { t } from "@/i18n/t";

/** Miejsce na mapie: baza, budowa albo pojazd. */
export interface MapPlace {
  id: string;
  kind: "base" | "site" | "vehicle";
  name: string;
  address?: string;
  toolCount: number;
}

/** Urządzenie z lokalizatorem, przypięte do miejsca, w którym jest według rejestru. */
export interface MapDevice {
  id: string;
  code: string;
  name: string;
  placeId: string;
}

type Selection = { type: "place"; id: string } | { type: "device"; id: string } | null;

/**
 * DEMO: mapa nie zna jeszcze współrzędnych budów ani sygnału lokalizatorów. Pozycje wyliczamy
 * z identyfikatora, żeby były stałe między odświeżeniami, a dane sygnału są przykładowe.
 */
function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

type Point = { x: number; y: number };

/** Pozycja w procentach mapy, odsunięta od brzegów i od już postawionych pinezek. */
function placePoints(places: MapPlace[]): Map<string, Point> {
  const points = new Map<string, Point>();
  for (const place of places) {
    let seed = hash(place.id);
    let point: Point = { x: 50, y: 50 };
    for (let attempt = 0; attempt < 12; attempt++) {
      point = place.kind === "base" ? { x: 46, y: 54 } : { x: 8 + (seed % 84), y: 12 + ((seed >>> 8) % 74) };
      const free = [...points.values()].every((other) => Math.hypot(other.x - point.x, (other.y - point.y) * 0.6) > 9);
      if (free) break;
      seed = hash(`${seed}`);
    }
    points.set(place.id, point);
  }
  return points;
}

/** Urządzenia krążą wokół swojego miejsca, żeby nie zasłaniały pinezki ani siebie nawzajem. */
function devicePoints(devices: MapDevice[], places: Map<string, Point>): Map<string, Point> {
  const points = new Map<string, Point>();
  const perPlace = new Map<string, number>();
  for (const device of devices) {
    const center = places.get(device.placeId);
    if (!center) continue;
    const index = perPlace.get(device.placeId) ?? 0;
    perPlace.set(device.placeId, index + 1);
    const angle = (index * 2.4 + (hash(device.id) % 10) / 10) % (2 * Math.PI);
    points.set(device.id, { x: center.x + Math.cos(angle) * 4.5, y: center.y + Math.sin(angle) * 7 });
  }
  return points;
}

/** Przykładowy sygnał lokalizatora. */
function demoSignal(id: string) {
  const seed = hash(id);
  return { minutesAgo: 1 + (seed % 55), battery: 20 + ((seed >>> 6) % 80) };
}

function Artwork() {
  return (
    <svg className="site-map-art" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="1000" height="560" fill="#e9ece6" />
      <path d="M0 90 C140 60 220 150 330 120 S520 30 610 80 S820 170 1000 120 V0 H0 Z" fill="#dfe7d7" />
      <path d="M720 380 C780 340 900 360 1000 330 V560 H640 C660 480 680 420 720 380 Z" fill="#d6e5cf" />
      <path d="M90 420 C130 390 210 400 230 440 S180 520 120 510 S60 450 90 420 Z" fill="#d6e5cf" />
      <path
        d="M-10 300 C120 280 180 360 300 350 S470 250 560 290 S700 420 820 400 S950 300 1010 320"
        fill="none"
        stroke="#bcd3ea"
        strokeWidth="26"
        strokeLinecap="round"
      />
      <g fill="none" strokeLinecap="round">
        <g stroke="#c9ccd1" strokeWidth="13">
          <path d="M0 180 L1000 210" />
          <path d="M460 0 L520 560" />
          <path d="M120 560 C220 420 300 260 460 200" />
          <path d="M520 330 C640 300 760 250 1000 470" />
        </g>
        <g stroke="#ffffff" strokeWidth="9">
          <path d="M0 180 L1000 210" />
          <path d="M460 0 L520 560" />
          <path d="M120 560 C220 420 300 260 460 200" />
          <path d="M520 330 C640 300 760 250 1000 470" />
        </g>
        <path d="M0 470 C250 440 600 520 1000 40" stroke="#f3d27a" strokeWidth="7" />
        <g stroke="#ffffff" strokeWidth="4" opacity="0.9">
          <path d="M240 0 L280 560" />
          <path d="M700 0 L660 560" />
          <path d="M0 400 L1000 360" />
          <path d="M820 0 C800 120 880 200 1000 230" />
        </g>
      </g>
    </svg>
  );
}

function PlaceMarker({ place, point, selected, onSelect }: { place: MapPlace; point: Point; selected: boolean; onSelect: () => void }) {
  const kindLabel = { base: t("board.baseKind"), site: t("board.siteKind"), vehicle: t("board.vehicleKind") }[place.kind];
  return (
    <button
      type="button"
      className={`map-pin map-pin-${place.kind}`}
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
      aria-pressed={selected}
      aria-label={`${kindLabel}: ${place.name}`}
      onClick={onSelect}
    >
      <span className="map-pin-head">{place.kind === "vehicle" ? <VehicleIcon /> : place.kind === "base" ? "B" : place.toolCount}</span>
      <span className="map-pin-label">{place.name}</span>
    </button>
  );
}

function Details({ selection, places, devices }: { selection: Selection; places: MapPlace[]; devices: MapDevice[] }) {
  if (!selection) return <p className="muted">{t("siteMap.hint")}</p>;
  if (selection.type === "place") {
    const place = places.find((candidate) => candidate.id === selection.id);
    if (!place) return null;
    const tracked = devices.filter((device) => device.placeId === place.id);
    return (
      <div className="site-map-details">
        <strong>{place.name}</strong>
        {place.address && <span className="muted">{place.address}</span>}
        <span>
          {t("board.toolCount", { count: place.toolCount })} · {t("siteMap.trackedCount", { count: tracked.length })}
        </span>
      </div>
    );
  }
  const device = devices.find((candidate) => candidate.id === selection.id);
  if (!device) return null;
  const place = places.find((candidate) => candidate.id === device.placeId);
  const signal = demoSignal(device.id);
  return (
    <div className="site-map-details">
      <span>
        <span className="plate">{device.code}</span> <strong>{device.name}</strong>
      </span>
      <span>{t("siteMap.devicePlace", { place: place?.name ?? "" })}</span>
      <span className="muted">
        {t("siteMap.lastSignal", { minutes: signal.minutesAgo })} · {t("siteMap.battery", { percent: signal.battery })}
      </span>
      <Link href={`/narzedzia/${device.id}`}>{t("siteMap.openTool")}</Link>
    </div>
  );
}

/** Mapa budów i urządzeń z lokalizatorami pod sekcją budów. Na razie tylko demo. */
export function SiteMap({ places, devices }: { places: MapPlace[]; devices: MapDevice[] }) {
  const [selection, setSelection] = useState<Selection>(null);
  const placeAt = placePoints(places);
  const deviceAt = devicePoints(devices, placeAt);
  const toggle = (next: NonNullable<Selection>) =>
    setSelection((current) => (current?.type === next.type && current.id === next.id ? null : next));

  return (
    <section className="board-section" aria-labelledby="board-map">
      <div className="section-head">
        <h2 id="board-map" className="display section-title">
          {t("siteMap.title")} <span className="tag tag-demo">{t("siteMap.demo")}</span>
        </h2>
        <ul className="map-legend">
          <li>
            <span className="map-legend-mark map-legend-site" /> {t("siteMap.legendSites")}
          </li>
          <li>
            <span className="map-legend-mark map-legend-base" /> {t("siteMap.legendBase")}
          </li>
          <li>
            <span className="map-legend-mark map-legend-device" /> {t("siteMap.legendDevices")}
          </li>
        </ul>
      </div>
      <div className="location site-map">
        <div className="site-map-canvas">
          <Artwork />
          {places.map((place) => (
            <PlaceMarker
              key={place.id}
              place={place}
              point={placeAt.get(place.id)!}
              selected={selection?.type === "place" && selection.id === place.id}
              onSelect={() => toggle({ type: "place", id: place.id })}
            />
          ))}
          {devices.map((device) => {
            const point = deviceAt.get(device.id);
            return (
              point && (
                <button
                  key={device.id}
                  type="button"
                  className="map-device"
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  aria-pressed={selection?.type === "device" && selection.id === device.id}
                  aria-label={t("siteMap.deviceLabel", { code: device.code, name: device.name })}
                  onClick={() => toggle({ type: "device", id: device.id })}
                />
              )
            );
          })}
        </div>
        <div aria-live="polite">
          <Details selection={selection} places={places} devices={devices} />
        </div>
        <p className="muted site-map-note">{t("siteMap.note")}</p>
      </div>
    </section>
  );
}
