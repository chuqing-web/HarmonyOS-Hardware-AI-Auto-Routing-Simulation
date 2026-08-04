# PCB Track Push & Shove (L-reroute) — Design

Date: 2026-08-04  
Status: approved for implementation (user: 直接执行 / approach 2)

## Goal

When dragging selected copper tracks, keep pad-anchored endpoints fixed; if the moved geometry clears into **other nets on the same layer**, locally replace conflicting foreign segments with an **orthogonal L-route** that restores clearance while preserving foreign connectivity between the same two endpoints.

## Active (selected) tracks

1. Call `lockTrackEndpointsToPads` before move.
2. Pad-locked ends do not translate; free ends translate by `(dx, dy)`.
3. If **both** ends are pad-locked on a single segment, reshape to a U dogleg for this frame (pad–offset–offset–pad) so the body can shove without leaving pads.
4. `syncMovedTrackJunctions` for free junctions.

## Passive (foreign) nets

1. After the active move, find same-layer foreign tracks whose clearance to any selected track fails (`pathClearOfTracks` / segment distance + half-widths + net clearance).
2. Cap at `MAX_FOREIGN_NETS` (4) per call.
3. For each conflicting foreign track (prefer unique nets first):
   - Anchors = that track’s `start` / `end` (already on pads or junctions).
   - Remove that track; try L candidates: HV (`routeLPoints` midH) and VH (midV).
   - Accept first candidate where every segment clears against remaining tracks (excluding removed).
   - Insert 1–2 new segments with same net/layer/width.
4. If neither L works, leave original geometry (no flash-delete).

## Non-goals (v1)

Via shove, footprint shove, cross-layer, multi-hop chain rebuild, full KiCad walkaround.

## Files

- `common/src/main/ets/utils/PcbTrackShoveUtil.ets` — conflict detect + L replace + dogleg helper
- `features/pcb_editor/.../PcbEditorImpl.ets` — `moveSelected` calls shove after track move
- `common/Index.ets` — export
