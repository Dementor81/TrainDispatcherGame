#!/usr/bin/env python3
"""Convert editor XML station exports to runtime TrackLayout JSON."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

PLATFORM_DIST_WARN = 80.0


def parse_editor_xml(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"<json>\s*(.*?)\s*</json>", text, re.DOTALL)
    if not match:
        raise ValueError(f"No <json> payload in {path}")
    return json.loads(match.group(1))


def point_bbox(data: dict[str, Any]) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for track in data.get("tracks") or []:
        for key in ("start", "end"):
            p = track.get(key)
            if p:
                xs.append(float(p["x"]))
                ys.append(float(p["y"]))
    for sw in data.get("switches") or []:
        loc = sw.get("location")
        if loc:
            xs.append(float(loc["x"]))
            ys.append(float(loc["y"]))
    if not xs:
        raise ValueError("No points to recenter")
    return min(xs), min(ys), max(xs), max(ys)


def translate_point(p: dict[str, Any], dx: float, dy: float) -> None:
    p["x"] = float(p["x"]) + dx
    p["y"] = float(p["y"]) + dy


def recenter(data: dict[str, Any]) -> tuple[float, float]:
    min_x, min_y, max_x, max_y = point_bbox(data)
    mid_x = (min_x + max_x) / 2.0
    mid_y = (min_y + max_y) / 2.0
    dx, dy = -mid_x, -mid_y

    for track in data.get("tracks") or []:
        translate_point(track["start"], dx, dy)
        translate_point(track["end"], dx, dy)
    for sw in data.get("switches") or []:
        if sw.get("location"):
            translate_point(sw["location"], dx, dy)
    for obj in data.get("objects") or []:
        if obj.get("pos"):
            translate_point(obj["pos"], dx, dy)

    return mid_x, mid_y


def track_length(track: dict[str, Any]) -> float:
    sx, sy = float(track["start"]["x"]), float(track["start"]["y"])
    ex, ey = float(track["end"]["x"]), float(track["end"]["y"])
    return math.hypot(ex - sx, ey - sy)


def project_point_on_track(px: float, py: float, track: dict[str, Any]) -> tuple[float, float]:
    """Return (distance_to_segment, km along track clamped to segment)."""
    ax, ay = float(track["start"]["x"]), float(track["start"]["y"])
    bx, by = float(track["end"]["x"]), float(track["end"]["y"])
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay), 0.0
    t = ((px - ax) * dx + (py - ay) * dy) / length_sq
    t_clamped = max(0.0, min(1.0, t))
    qx, qy = ax + t_clamped * dx, ay + t_clamped * dy
    dist = math.hypot(px - qx, py - qy)
    length = math.sqrt(length_sq)
    return dist, t_clamped * length


def project_km_unclamped(px: float, py: float, track: dict[str, Any]) -> float:
    ax, ay = float(track["start"]["x"]), float(track["start"]["y"])
    bx, by = float(track["end"]["x"]), float(track["end"]["y"])
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return 0.0
    t = ((px - ax) * dx + (py - ay) * dy) / length_sq
    return t * math.sqrt(length_sq)


def signed_side(track: dict[str, Any], px: float, py: float) -> float:
    """Positive = left of start→end (renderer normal side)."""
    ax, ay = float(track["start"]["x"]), float(track["start"]["y"])
    bx, by = float(track["end"]["x"]), float(track["end"]["y"])
    dx, dy = bx - ax, by - ay
    return dx * (py - ay) - dy * (px - ax)


def convert_signal(sig: dict[str, Any]) -> dict[str, Any]:
    pos = sig.get("_positioning") or {}
    above = bool(pos.get("above", False))
    return {
        "type": "main",
        "position": int(round(float(pos.get("km", 0)))),
        "direction": -1 if above else 1,
    }


def convert_switch_ref(ref: Any, has_bumper: bool, exit_id: int | None) -> Any:
    if ref is None:
        if not has_bumper and exit_id is not None:
            return {"type": "Exit", "id": exit_id}
        return None
    return {"type": ref["type"], "id": ref["id"]}


def collect_exit_candidates(tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for track in tracks:
        has_bumper = bool(track.get("hasBumper", True))
        switches = track.get("switches") or []
        for end_index, ref in enumerate(switches):
            if ref is not None or has_bumper:
                continue
            point = track["start"] if end_index == 0 else track["end"]
            candidates.append(
                {
                    "track_id": track["id"],
                    "end_index": end_index,
                    "x": float(point["x"]),
                    "y": float(point["y"]),
                }
            )
    return candidates


def assign_exit_ids(candidates: list[dict[str, Any]]) -> dict[tuple[int, int], int]:
    left = sorted((c for c in candidates if c["x"] < 0), key=lambda c: (c["y"], c["x"]))
    right = sorted((c for c in candidates if c["x"] >= 0), key=lambda c: (c["y"], c["x"]))
    mapping: dict[tuple[int, int], int] = {}
    for i, c in enumerate(left):
        mapping[(c["track_id"], c["end_index"])] = 2 * i
    for i, c in enumerate(right):
        mapping[(c["track_id"], c["end_index"])] = 2 * i + 1
    return mapping


def attach_platforms(
    objects: list[dict[str, Any]], tracks: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    platforms: list[dict[str, Any]] = []
    warnings: list[str] = []

    for obj in objects:
        if obj.get("type") != 2:
            continue
        pos = obj["pos"]
        size = obj["size"]
        x0, y0 = float(pos["x"]), float(pos["y"])
        w, h = float(size["width"]), float(size["height"])
        cx, cy = x0 + w / 2.0, y0 + h / 2.0
        corners = [
            (x0, y0),
            (x0 + w, y0),
            (x0, y0 + h),
            (x0 + w, y0 + h),
        ]

        best_track = None
        best_dist = float("inf")
        for track in tracks:
            dist, _ = project_point_on_track(cx, cy, track)
            if dist < best_dist:
                best_dist = dist
                best_track = track

        if best_track is None:
            warnings.append("platform skipped: no tracks")
            continue

        if best_dist > PLATFORM_DIST_WARN:
            warnings.append(
                f"platform near track {best_track['id']}: distance {best_dist:.1f}px > {PLATFORM_DIST_WARN}"
            )

        length = track_length(best_track)
        kms = [project_km_unclamped(px, py, best_track) for px, py in corners]
        lo = max(0.0, min(kms))
        hi = min(length, max(kms))
        if hi < lo:
            lo, hi = hi, lo

        # Right of start→end (cross < 0) → "above" → decreasing from/to
        above = signed_side(best_track, cx, cy) < 0
        from_km = int(round(hi if above else lo))
        to_km = int(round(lo if above else hi))

        platforms.append(
            {
                "track": best_track["id"],
                "from_km": from_km,
                "to_km": to_km,
                "_dist": best_dist,
            }
        )

    return platforms, warnings


def convert_station(data: dict[str, Any], station_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    recenter(data)

    tracks_in = data.get("tracks") or []
    switches_in = data.get("switches") or []
    objects = data.get("objects") or []

    exit_map = assign_exit_ids(collect_exit_candidates(tracks_in))

    tracks_out: list[dict[str, Any]] = []
    exit_report: list[dict[str, Any]] = []
    signal_count = 0

    for track in tracks_in:
        has_bumper = bool(track.get("hasBumper", True))
        switch_refs = track.get("switches") or []
        out_switches: list[Any] = []
        for end_index, ref in enumerate(switch_refs):
            exit_id = exit_map.get((track["id"], end_index))
            converted = convert_switch_ref(ref, has_bumper, exit_id)
            out_switches.append(converted)
            if isinstance(converted, dict) and converted.get("type") == "Exit":
                point = track["start"] if end_index == 0 else track["end"]
                exit_report.append(
                    {
                        "id": converted["id"],
                        "track": track["id"],
                        "end": end_index,
                        "x": round(float(point["x"]), 1),
                        "y": round(float(point["y"]), 1),
                    }
                )

        signals = [convert_signal(s) for s in (track.get("signals") or [])]
        signal_count += len(signals)

        tracks_out.append(
            {
                "id": track["id"],
                "start": {
                    "x": round(float(track["start"]["x"]), 1),
                    "y": round(float(track["start"]["y"]), 1),
                },
                "end": {
                    "x": round(float(track["end"]["x"]), 1),
                    "y": round(float(track["end"]["y"]), 1),
                },
                "signals": signals,
                "switches": out_switches,
            }
        )

    switches_out = [
        {
            "id": sw["id"],
            "location": {
                "x": round(float(sw["location"]["x"]), 1),
                "y": round(float(sw["location"]["y"]), 1),
            },
            "tracks": list(sw.get("tracks") or []),
        }
        for sw in switches_in
    ]

    platforms_raw, platform_warnings = attach_platforms(objects, tracks_in)
    platforms_out = [
        {"track": p["track"], "from_km": p["from_km"], "to_km": p["to_km"]} for p in platforms_raw
    ]

    result = {
        "id": station_id,
        "tracks": tracks_out,
        "switches": switches_out,
        "platforms": platforms_out,
    }
    report = {
        "tracks": len(tracks_out),
        "switches": len(switches_out),
        "signals": signal_count,
        "platforms": [
            {
                "track": p["track"],
                "from_km": p["from_km"],
                "to_km": p["to_km"],
                "dist": round(p["_dist"], 1),
            }
            for p in platforms_raw
        ],
        "exits": sorted(exit_report, key=lambda e: e["id"]),
        "warnings": platform_warnings,
    }
    return result, report


def station_display_id(stem: str) -> str:
    return stem[:1].upper() + stem[1:] if stem else stem


def process_layout(layout_dir: Path, station_filter: str | None, dry_run: bool, force: bool) -> int:
    stations_dir = layout_dir / "stations"
    if not stations_dir.is_dir():
        print(f"No stations directory at {stations_dir}", file=sys.stderr)
        return 1

    xml_files = sorted(stations_dir.glob("*.xml"))
    if station_filter:
        xml_files = [p for p in xml_files if p.stem == station_filter]
        if not xml_files:
            print(f"No station matching '{station_filter}'", file=sys.stderr)
            return 1

    if not xml_files:
        print(f"No XML stations in {stations_dir}", file=sys.stderr)
        return 1

    for xml_path in xml_files:
        stem = xml_path.stem
        out_path = stations_dir / f"{stem}.json"
        data = parse_editor_xml(xml_path)
        result, report = convert_station(data, station_display_id(stem))

        print(f"=== {stem} ===")
        print(
            f"tracks={report['tracks']} switches={report['switches']} "
            f"signals={report['signals']} platforms={len(report['platforms'])} "
            f"exits={len(report['exits'])}"
        )
        for e in report["exits"]:
            print(f"  exit {e['id']}: track={e['track']} end={e['end']} xy=({e['x']},{e['y']})")
        for p in report["platforms"]:
            print(
                f"  platform track={p['track']} from_km={p['from_km']} "
                f"to_km={p['to_km']} dist={p['dist']}"
            )
        for w in report["warnings"]:
            print(f"  WARNING: {w}")

        if dry_run:
            print(f"  dry-run: would write {out_path}")
            continue

        if out_path.exists() and not force:
            print(f"  skip existing {out_path} (use --force)")
            continue

        out_path.write_text(json.dumps(result, indent=3) + "\n", encoding="utf-8")
        print(f"  wrote {out_path}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "layout_dir",
        type=Path,
        help="Track layout directory containing stations/ (e.g. server/data/TrackLayouts/nebelgrundbahn)",
    )
    parser.add_argument("--station", help="Convert only this station stem (e.g. aurich)")
    parser.add_argument("--dry-run", action="store_true", help="Transform but do not write JSON")
    parser.add_argument("--force", action="store_true", help="Overwrite existing JSON files")
    args = parser.parse_args()
    return process_layout(args.layout_dir.resolve(), args.station, args.dry_run, args.force)


if __name__ == "__main__":
    raise SystemExit(main())
