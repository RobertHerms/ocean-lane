# Interior accuracy pass — round 2 fixes

These are review fixes on branch **`interior-accuracy`** (draft PR #1). The rules of `CLOUD_PLAN.md` §0 still apply:

- work on `interior-accuracy`; never push to `main`, never merge;
- commit as `Ocean Lane <ocean-lane@users.noreply.github.com>`, each message ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
- no names, addresses or personal images;
- don't touch `baked/*`, the kids files, or the robots meta in `index.html`;
- lamps are `'down'` or `'omni'` only.

Check geometry with `tools/shots.mjs` (`?nobake`). The owner re-bakes locally afterwards. Commit after each item. The
items are in priority order. Refresh `review/` at the end and update the PR description with a short "Round 2" list.

Coordinates: feet, x east, z south (the front door is at z = 30; the back of the house is −z), y up. `MAIN` = 10,
`MAIN_CEIL` = 18, `LOW` = 0, `LOW_CEIL` = 9.5, `FRONT` = 6.875.

---

## 1. Doorknobs: turn the oval 90°

In `doorKnob()` (house.js), the knob is squashed with `lathe.scale(1, 1, 0.74)` before it's rotated onto the door.
That makes it wider than tall, like a sideways 0. It should be **taller than wide**, like a 0.

- Change it to `lathe.scale(0.74, 1, 1)`, so the squash is horizontal once rotated.
- Check that the knob on both faces of a door and on the front door reads as a tall oval.
- The rose plate stays as is.

## 2. Kitchen soffit colour

The soffit above the upper cabinets, and the bulkhead over the sink window, use `'paint:#e6dcc4'`. They should be the
same colour and sheen as the cabinets. Use the `'cabinet'` material for both.

## 3. Door thresholds flicker (upstairs hall)

**Cause:**
- The main-level interior walls start at `MAIN - 0.1`, so under every door there's a 0.1-tall strip of wall.
- `walls()` gives that strip a TRIM top face at exactly `y = MAIN` (the "sill" face: `if (Math.abs(op.b0 - e0) < 1e-6)`).
- The floor polygons of the rooms on both sides also sit at `y = MAIN` and run to the wall centreline.
- The white sill face and the wood floor are therefore coplanar across the wall thickness and z-fight as you walk
  through.

**Fix:**
- For `kind === 'door'` ops whose `b0` is at a floor level, don't emit that top face. The two room floors already cover
  the doorway.
- Keep the face for windows and for openings above floor level (the pass-through stool, window sills).
- Check that no other coplanar pair remains at doorways: bath tile against hall wood, closet floors, and the lower level.
- Write a small script that scans `buildHouse()` parts for coplanar, overlapping horizontal polys at the same `y`. Run
  it once and fix what it finds. Mention anything left in the PR.

## 4. Baseboard on outside corners (both floors)

`moldings()` only wraps **crown** round outside corners (`m0`/`m1` mitres when a wall end has nothing crossing in front
of it). The base stops short, so outside corners, like the pier by the fridge doorway and the wall ends at the playroom
and dining openings, have no baseboard.

**a. Outside corners.**
- Apply the same outside-corner test and mitres to `BASE`, and to `RAIL`, the chair rail in bedroom 1.
- The end must then continue onto the wall's end face as a short run. That's what already happens for crown, because
  the crossing wall's face gets its own run.
- Where the end face belongs to no room rect, add the end-face run explicitly: a short base run along the end face,
  mitred at both corners.

**b. Uncased openings.**
- Plain drywall-wrapped openings are `kind === 'open'` without `passThrough` and without casing: the fridge doorway,
  the playroom openings and the living/dining openings.
- There, the base currently stops 0.29 short (the casing gap). Use a gap of **0**.
- Wrap the base **round the jamb**: a run along each jamb face through the wall thickness, mitred to the face runs on
  both sides.

**Acceptance:** screenshots of the fridge-doorway pier, a playroom opening and a bedroom-hall outside corner, showing
continuous, mitred baseboard.

## 5. Black bars on the lip of each back-stair step

On the rear flights (`rearUp`, `rearDown`, carpet), every tread nose shows a thin black line.

**Cause:** the nose's front face is only 0.09 tall. It gets its own lightmap chart, and its texels land mostly inside
the riser block below (the bake masks buried texels), so it bakes black.

**Fix, in `stairs()`:**
- **Carpet flights:** stop the tread box at the riser line (no overhang box). Add the nose as a probe-lit **bullnose**:
  a `b.prim` cylinder, radius 0.05, running the tread width along x, centred just in front of the riser top, in carpet.
  Carpet on real stairs wraps the nose, so a rounded lip is right.
- **Oak flights:** make the nose's front face probe-lit too. Draw it as a thin `b.mbox`, and drop the `pz`/`nz` face
  from the lightmapped tread box, so the same artifact can't happen there.
- The treads' top faces stay lightmapped.

## 6. Hall-bath skylight: an angled shaft toward the back of the house

Now the bath-1 well (`SKYLIGHTS[0]` = x 21.7–24.1, z 7.8–10.2) is a vertical box up to a flat glazed top. The real one
is a **sloped shaft**.

**Ceiling opening:** unchanged, x 21.7–24.1, z 7.8–10.2.

**Glass:**
- A 1.8 (x) × 2.0 (along the roof) unit, **lying in the roof plane**. The roof there slopes up toward the south;
  see `ROOF_PLANES` and `roofUnder()`.
- x 22.0–23.8, centred on the opening's x.
- Its **south edge** is directly above z = 7.8, the opening's north edge. From there it runs 2.0 along the roof toward
  the north.

**Shaft:**
- The north and south faces are parallel planes leaning toward the back (−z): each goes from its ceiling-opening edge
  up to the matching glass edge. The south face runs from (z 10.2, y 18) to the glass's south edge. The north face runs
  from (z 7.8, y 18) to the glass's north edge.
- The east and west faces taper from the opening's width to the glass's width.
- All faces are ceiling white.
- Keep the vinyl curb and frame round the glass, following the roof slope. The glass polygon (`glass.push`) follows the
  roof plane.

**Wall can light:**
- The `'wellcan'` in the well's south face has to move to the new sloped south face: mid-width, about a third of the
  way up the face.
- Its ring faces along the face normal (down-north).
- Recompute the lamp position about 0.2 off the face.

Only the bath-1 skylight changes. The rear-stair skylight stays as it is. Handle this with a per-skylight option, for
example `SKYLIGHTS` entries becoming objects with an optional `lean`.

## 7. Wrong tile at the front door (entry landing)

The landing at `FRONT`, x 20.8–28.8, z ≈ 20–30, and the lower hall at the foot of the front stairs use `tileLanding`.
That's a warm beige 18" tile that doesn't match.

**Real tile:** large porcelain, **18"×18"**, straight lay. A cool greige, mottled light-to-mid grey-taupe
(average about `#b9b2a7`) with soft stone-like clouding, thin light-grey grout (`#cfcac2`, about 1/8").

**Fix:**
- Make a new texture `textures/tile_entry.jpg`, 1024², covering 3 ft × 3 ft (2×2 tiles), plus a subtle normal map
  `tile_entry_normal.jpg` (grout lines recessed).
- Generate it with a small Python/PIL script in `tools/` (seamless: the grout on the tile edges wraps).
- Add a `tileEntry` material (`repeat: 3`, roughness about 0.6).
- Use it for the landing floor polys (`floorsAndCeilings()`, the `tileLanding` polys) and the foyer room's floor key.
- Leave `tileLanding` defined but unused, or remove it if nothing else uses it.
- Put the new texture files in the PR.
- Check with `?nobake` that the grid lines up with the front-door unit (a grout line on the door's centreline is fine).

## 8. Closet under the front stairs: open at the back right

Standing in the closet doorway (z = 19.5) looking in (south, +z), "right" is **west** (−x). Currently the partition
along x = 24.8 is mostly solid, with a triangle opening (`KNEEWALLS[0].hole`, z 20.5→26) that closes again before the
back.

**Reality:**
- The partition is **full height for only about 1 ft** (one 12" floor tile) past the door jamb: z 19.5 → 20.5.
- South of z = 20.5 it is **open underneath the bottom flight**. The opening's top edge is the underside of the bottom
  flight (`SOFFITS.frontDown`, rising toward the south), and it does **not** close again.
- South of the flight's top (z > `FD.z1`), under the entry landing, the partition doesn't exist at all. The back-right
  area (x 20.8–24.8, z `FD.z1`→29.75) is **open to the closet**.

**Changes:**
- **Partition hole:** `hole.z0 = 20.5` and runs to `FD.z1` with no closing edge. Past `FD.z1`, no partition below the
  landing. Keep the part of the knee wall **above** the stair and landing, the half wall with the balustrade; only the
  part below the stair and landing structure changes.
- **Solids:** remove the solid mass under the landing at x 20.8–24.8 (the remaining `SOLIDS` entry / part covering
  x 20.8–24.8, z `FD.z1`–30, y 0–`FRONT`). Keep the landing floor at `FRONT`.
- **The newly opened area:**
  - tile floor (`tileGrey`), continuing the closet's;
  - a flat ceiling at the same height as the closet's landing ceiling (6.18);
  - white walls (the stairwell's west wall face x = 20.8 and the front foundation wall), with the same 4.5 ft ledge
    along the front wall continuing west to x = 20.8;
  - it becomes part of `stcl`: extend the room rects.
- **Colliders:** the player can walk in under the landing. Under the bottom flight, block wherever headroom is below
  5.5 ft (a collider under the soffit, not a wall at x = 24.8).
- **Light:** the existing dome stays. If the new area is visibly dark in a `?nobake` shot, that's expected; the bake will
  light it.

**Acceptance:** `stair_closet` and `stair_closet_west` show a 1 ft full-height return at the door, then the sloped
opening running to the back, and the back-right open under the landing.

## 9. Found in review: a green sliver at the back-stair ceiling

Looking up the rear stairs from the kitchen, there's a bright green line along the joint where the sloped annex
ceiling meets the underside of the kitchen/rear-stair header (z ≈ −0.2 to 0, y ≈ 16.75). It's the lawn seen through a
gap in the shell.

- Find the gap: the header wall `wx(0, 35, 42.2, ...)` opening top at 16.75, the annex ceiling (`annexCeil`) and the
  lean-to roof plane.
- Close it so the ceiling meets the header with no gap.
- Also look at the new back-stair track light: its glowing part renders as a floating bright rectangle. Make sure the
  glow is only on the two spot-head lenses, not on the track.

---

## Finish

1. Push `interior-accuracy`.
2. Update draft PR #1's description with a "Round 2" section: each item done, partial or skipped, plus notes.
3. **Don't merge.**
