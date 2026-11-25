// SPEC-poi-destinations v1.2: Google's Places UI Kit, loaded on the first rating card only.

const READY = "__hakubaGoogleMapsReady";

declare global {
  interface Window {
    google?: { maps: { importLibrary(name: string): Promise<unknown> } };
    [READY]?: () => void;
  }
}

let placesLoad: Promise<unknown> | undefined;

/** Loads the Maps JavaScript API once and defines the `gmp-place-*` elements. */
export function loadGooglePlaces(key: string): Promise<unknown> {
  placesLoad ??= new Promise<void>((resolve, reject) => {
    // With loading=async, importLibrary only exists once Google calls back; the script's load
    // event fires before that.
    window[READY] = resolve;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${READY}`;
    script.async = true;
    script.onerror = () =>
      reject(new Error("Google Maps script failed to load"));
    document.head.append(script);
  })
    .then(() => window.google?.maps.importLibrary("places"))
    .catch((error: unknown) => {
      placesLoad = undefined; // a dropped mountain signal shouldn't hide every later card
      throw error;
    });
  return placesLoad;
}
