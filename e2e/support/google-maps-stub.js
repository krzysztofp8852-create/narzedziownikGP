// Atrapa Maps JavaScript API do testu dymnego: test nie pyta Google ani nie potrzebuje klucza. Mapa to zwykły element,
// a pinezka to przycisk z nazwą (title) i położeniem w data-lat / data-lng. `window.__stubMap.clickAt(lat, lng)` udaje
// kliknięcie w mapę, a `window.__stubMap.drag(title, lat, lng)` przeciągnięcie pinezki.
(() => {
  const withListeners = (target) => {
    const listeners = {};
    target.addListener = (name, listener) => {
      (listeners[name] ??= []).push(listener);
      return { remove() {} };
    };
    target.fire = (name, event) => (listeners[name] ?? []).forEach((listener) => listener(event));
  };

  class LatLng {
    constructor(lat, lng) {
      this.position = { lat, lng };
    }
    toJSON() {
      return this.position;
    }
  }

  class LatLngBounds {
    points = [];
    extend(point) {
      this.points.push(point);
    }
  }

  const markers = new Map();
  const maps = [];

  class StubMap {
    constructor(element) {
      withListeners(this);
      this.element = element;
      element.dataset.stubMap = "";
      maps.push(this);
    }
    setCenter(center) {
      this.element.dataset.center = JSON.stringify(center);
    }
    setZoom(zoom) {
      this.element.dataset.zoom = String(zoom);
    }
    fitBounds(bounds) {
      this.element.dataset.bounds = JSON.stringify(bounds.points);
    }
  }

  class AdvancedMarkerElement {
    constructor({ map, position, title, content, gmpDraggable }) {
      withListeners(this);
      this.button = document.createElement("button");
      this.button.type = "button";
      this.button.setAttribute("aria-label", title);
      this.button.dataset.draggable = String(Boolean(gmpDraggable));
      this.button.addEventListener("click", () => this.fire("click"));
      this.content = content;
      this.position = position;
      this.map = map;
      markers.set(title, this);
    }
    set content(content) {
      this.button.replaceChildren(content);
    }
    get content() {
      return this.button.firstChild;
    }
    set position(position) {
      this.current = position;
      this.button.dataset.lat = String(position.lat);
      this.button.dataset.lng = String(position.lng);
    }
    get position() {
      return this.current;
    }
    set map(map) {
      this.owner = map;
      if (map) map.element.append(this.button);
      else this.button.remove();
    }
    get map() {
      return this.owner;
    }
  }

  const libraries = { core: { LatLng, LatLngBounds }, maps: { Map: StubMap }, marker: { AdvancedMarkerElement } };
  window.google = { maps: { importLibrary: async (name) => libraries[name] } };
  window.__stubMap = {
    clickAt: (lat, lng) => maps.at(-1).fire("click", { latLng: new LatLng(lat, lng) }),
    drag: (title, lat, lng) => {
      const marker = markers.get(title);
      marker.position = { lat, lng };
      marker.fire("dragend");
    },
  };
  window[new URL(document.currentScript.src).searchParams.get("callback")]();
})();
