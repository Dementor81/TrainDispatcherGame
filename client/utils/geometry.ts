import { Point } from "./point";


export class Geometry {
    static getPointOnCurve(t:number, p0:Point, cp:Point, p1:Point):Point {
        const oneMinusT = 1 - t;
        const tSquared = t * t;
        const oneMinusTSquared = oneMinusT * oneMinusT;
        const twoTimesT = 2 * oneMinusT * t;
  
        return new Point(
           oneMinusTSquared * p0.x + twoTimesT * cp.x + tSquared * p1.x,
           oneMinusTSquared * p0.y + twoTimesT * cp.y + tSquared * p1.y
        );
     }
  
     static getDegreeOfTangentOnCurve(t:number, p0:Point, cp:Point, p1:Point):number {
        const mt = 1 - t;
        const dx = 2 * (mt * (cp.x - p0.x) + t * (p1.x - cp.x));
        const dy = 2 * (mt * (cp.y - p0.y) + t * (p1.y - cp.y));
        return Math.atan2(dy, dx);
     }
}