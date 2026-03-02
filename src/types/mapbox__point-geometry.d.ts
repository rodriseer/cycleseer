declare module "@mapbox/point-geometry" {
  // Minimal stub to satisfy TypeScript; mapbox-gl uses this internally.
  export default class Point {
    constructor(x: number, y: number);
    x: number;
    y: number;
    add(p: Point): Point;
    sub(p: Point): Point;
    mult(k: number): Point;
    div(k: number): Point;
    round(): Point;
    floor(): Point;
    dist(p: Point): number;
    mag(): number;
    unit(): Point;
    perp(): Point;
    rotate(a: number): Point;
    angle(): number;
  }
}

