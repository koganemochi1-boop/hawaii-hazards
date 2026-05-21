// Ambient declarations for CDN-loaded globals that aren't npm packages.
// Script-style declaration file (no top-level `export`/`import`) so all
// declarations land in the global scope.

interface TurfNs {
  point: (coords: number[], properties?: any) => any;
  booleanPointInPolygon: (point: any, polygon: any) => boolean;
  polygon: (coords: number[][][]) => any;
  bbox: (feature: any) => [number, number, number, number];
  area: (feature: any) => number;
  intersect: (features: any) => any;
  length: (line: any, opts?: { units?: string }) => number;
  lineString: (coords: number[][]) => any;
  featureCollection: (features: any[]) => any;
}

declare const maplibregl: {
  Map: new (opts: any) => any;
  Marker: new (opts?: any) => any;
  Popup: new (opts?: any) => any;
  NavigationControl: new (opts?: any) => any;
  ScaleControl: new (opts?: any) => any;
};

declare const turf: TurfNs;

declare const Papa: {
  parse: (csv: string, opts?: any) => { data: any[]; meta: { fields: string[] } };
  unparse: (rows: any[]) => string;
};

declare const html2canvas: (el: HTMLElement, opts?: any) => Promise<HTMLCanvasElement>;
declare const jspdf: any;
declare const MapboxDraw: any;

// Project-level globals exposed for debugging and for the test env helpers.
interface Window {
  __app?: { map: any; layerManager: any };
  __urlStateWired?: boolean;
}
