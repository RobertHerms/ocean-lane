# Interior accuracy pass — round 3 (plus what's left of round 2)

Branch **`interior-accuracy`**, draft PR #1. The rules of `CLOUD_PLAN.md` §0 apply:

- never push to `main`, never merge;
- commit as `Ocean Lane <ocean-lane@users.noreply.github.com>`, each message ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
- no names, addresses or personal images;
- don't touch `baked/*`, the kids files, or the robots meta;
- lamps are `'down'` or `'omni'` only.

**Push after every commit** so progress is visible. Check geometry with `tools/shots.mjs` (`index.html?nobake`). If the
screenshot tooling won't start within a few minutes, use `node --check` plus careful reasoning and say so in the PR.
Don't retry it endlessly.

Round 2 items 1–8 in `FIXES_PLAN.md` are **done** (commits `9c459d7`…`93f43af`). Do the items below in order.

Coordinates: feet, x east, z south (the front door is at z = 30; the back of the house is −z), y up. `MAIN` = 10,
`MAIN_CEIL` = 18, `LOW` = 0, `MID` = 5, `FRONT` = 6.875.

---

## A. Green sliver at the back-stair ceiling (round 2, item 9)

Looking up the rear stairs from the kitchen, there's a bright green line along the joint where the sloped annex
ceiling meets the underside of the kitchen/rear-stair header (z ≈ −0.2 to 0, y ≈ 16.75). It's the lawn seen through a
gap in the shell.

- Find the gap: the header wall `wx(0, 35, 42.2, ...)` opening top at 16.75, the annex ceiling (`annexCeil`) and the
  lean-to roof plane.
- Close it so the ceiling meets the header with no gap.
- The back-stair track light's glowing part renders as a floating bright rectangle. Make the glow only the two
  spot-head lenses, not the track.

## B. Back-stair carpet reads blue-grey; it should be light beige (round 2, item 10)

The carpet on the rear flights, the MID landing and the rear closet (rear annex, x 35–45, z −8–0) looks blue-grey. It
should be the same light beige as the playroom (`carpetBeige`).

**Root cause, measured on the owner's bake:**
- A ray straight down onto the MID landing at (37, −6.5) hits a surface coloured `#c7b18d` with **no texture map**.
- That's the top face of the `SOLIDS` box `{ b: [35, 42.2, 0, MID, -8, -4.4], paint: PAINT.tan }`, drawn with
  `skip: ['ny']` only. It sits exactly at y = MID, coplanar with the carpet floor.
- So the landing shows tan paint (z-fighting with the carpet) under strongly sky-blue baked light.

**Fix:**
- In the `SOLIDS` loop, don't emit the top face (`'py'`) of any solid whose top is a walkable floor that already has its
  own floor poly: the MID annex solids, the landing solids at `FRONT`, and any others.
- Check every `SOLIDS` entry against `FLOORS` and the floor polys, so the carpet/tile floor is the only surface at that
  height.
- Also confirm that every carpet surface in the annex uses `carpetBeige` with its texture: treads, risers, landing and
  the `coat` closet floor.
- The remaining blue cast from the skylight is a bake-side matter for the owner. Just note it in the PR.

## C. Gap along the top of the living-room / stairwell half wall

The wall under the living-room balustrade, `wz(28.8, 19.5, 30, [0, MAIN + 0.1], [], { t: EXT_T })` (faces at x 28.55
and 29.05), has **no top face**. From the foyer you look down past the balusters into the wall cavity: a ray straight
down at x 28.6, z 22 falls through to the stair below. The living-room floor stops at x 28.8, and the rail shoe only
covers about x 28.69–28.91.

**Fix for this wall:**
- Lower its top to exactly `MAIN`.
- Extend the living-room floor over the full wall thickness to x 28.55 (hardwood, same floor chart).
- Finish the stairwell side (the x 28.55 face) with a small oak nosing or white trim edge, 0.06 proud, z 20→29.75.
- The rail shoe then sits on hardwood.

**In general:**
- In `walls()`, emit a top face for any wall whose top (`w.y[1]`) is below the ceilings on both sides and isn't
  already capped. Knee walls already have caps.
- Scan for others by casting rays straight down onto each wall's centre line at a few points. Check the rear-stair and
  foyer/landing walls especially, and fix any open tops you find.

**Acceptance:** a foyer view looking at the living-room railing (x 26.2, z 20.1, feet 9.93, yaw 3.56, pitch −0.6) shows
no dark slot along the base of the balusters.

## D. Half newels where a railing dies into a wall

Where a railing ends at a wall, the real post is a **half newel**. It's the paneled box newel split vertically down its
centre plane, parallel to the wall:
- full width (0.46) along the wall face;
- half depth (0.23) out from the wall;
- the cut face against the wall.

It keeps the same profile as the paneled newels (plinth, panels, collar, upper block, cap plate, cushion), with no
panel on the wall side.

- **Living room:** where `RAILINGS[0]` ends at the front wall (z 29.75 face), put a half newel with its back on the
  wall, occupying z 29.52→29.75. Extend the rail to meet it.
- **Kitchen / rear stairs:** where `RAILINGS[4]` ends at the wall (x 42.0 face), put a half newel occupying
  x 41.77→42.0. Adjust `x1` so the rail meets it.
- Any other railing end that meets a wall gets the same treatment. Free-standing ends keep full newels.
- Add a `half` option to the newel builder (for example `newels: [0, { t: 1, half: 'z+' }]`).

**Acceptance:** screenshots of both wall ends show half posts flush on the wall.

## E. Kitchen sink: the window trim clips the faucet

The faucet (`faucet(b, (sx0+sx1)/2, cTop, N + 0.12, 's')`) stands in the interior stool and apron of the window over
the sink. In reality that window has only a **narrow stool and no apron** (the backsplash sits under it), and the
faucet stands clear in front.

- For this window, and any window whose sill is within 1 ft above a countertop: no apron, and a stool no deeper than
  0.1 past the wall face.
- Move the sink basin forward: `sz0 = N + 0.6`, `sz1 = N + 1.95`. Update the counter cut-out pieces and `sinkInner`.
- Put the faucet base at `z = N + 0.42`.
- Check that nothing intersects:
  - the faucet body and spout against the stool, casing, glass and backsplash;
  - the basin against the counter front (z 2.38) and the sink-base cabinet front.

**Acceptance:** a close-up of the sink from the room (x 33, z 3.2, feet 10, yaw 0.1, pitch −0.1) and one from the side.

## F. Light switch on the front-door sidelight glass

`switchPlates()` puts the plate beside the latch at `a1 + 0.29 + 0.3`. For the front door (a unit with sidelights,
`unit: [22.25, 27.35]`, casing 0.33 wide) that lands on the east sidelight glass.

- For doors with `unit`, place the plate outside the unit's casing on the latch side instead: on the interior face (the
  z < 30 side) at x = 27.35 + 0.33 + 0.3 ≈ 27.98, which is left of the door trim as seen from inside. Height:
  y = FRONT + 4.0.
- Check it doesn't clash with the foyer wall end at x 28.8 or any casing.
- Check the other doors for plates that land on glass or casing.

**Acceptance:** a foyer shot facing the front door shows the plate on the wall, left of the casing.

---

## Finish

1. Refresh `review/`.
2. Push `interior-accuracy`.
3. Add a "Round 3" section to PR #1's description: each item A–F done, partial or skipped, with notes.
4. **Don't merge.**
