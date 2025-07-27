import * as PIXI from 'pixi.js';
import { Point } from '../utils/point';




export function drawArrow(container: PIXI.Container, from: Point, to: Point, options?: {
    color?: number,
    width?: number,
    headLength?: number,
    headAngle?: number,
}) {
    const {
        color = 0xffffff,
        width = 4,
        headLength = 15,
        headAngle = Math.PI / 8, // angle between arrowhead sides
    } = options || {};

    const g = new PIXI.Graphics();
    container.addChild(g);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    // End of the shaft
    const endX = to.x;
    const endY = to.y;

    // Arrowhead points
    const angle1 = angle - headAngle;
    const angle2 = angle + headAngle;

    const x1 = endX - headLength * Math.cos(angle1);
    const y1 = endY - headLength * Math.sin(angle1);
    const x2 = endX - headLength * Math.cos(angle2);
    const y2 = endY - headLength * Math.sin(angle2);

    // Draw the shaft
    
    g.moveTo(from.x, from.y);
    g.lineTo(endX, endY);

    // Draw the arrowhead
    g.moveTo(endX, endY);
    g.lineTo(x1, y1);
    g.moveTo(endX, endY);
    g.lineTo(x2, y2);
    g.stroke({ width: width, color: color, alpha: 1, cap: "round" });
}