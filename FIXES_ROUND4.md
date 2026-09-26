# Interior accuracy pass — round 4

Branch **`interior-accuracy`**, draft PR #1. The rules of `CLOUD_PLAN.md` §0 apply:

- never push to `main`, never merge;
- commit as `Ocean Lane <ocean-lane@users.noreply.github.com>`, each message ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
- no names, addresses or personal images;
- don't touch `baked/*`, the kids files, or the robots meta;
- lamps are `'down'` or `'omni'` only.

**Push after every commit.** Check geometry with `tools/shots.mjs` (`index.html?nobake`). If the screenshot tooling
won't start within a few minutes, use `node --check` plus careful reasoning and say so in the PR.

Do the items in order and commit each one separately. At the end, refresh `review/` and add a "Round 4" section to PR
#1's description.

Coordinates: feet, x east, z south (the front door is at z = 30; the back of the house is −z), y up. `MAIN` = 10,
`MAIN_CEIL` = 18, `LOW` = 0, `MID` = 5.

---

## 1. Kitchen tile and back-stair carpet read blue-grey

In the baked walkthrough, the kitchen floor looks like cool, dark grey tile. The owner wants **warm off-white**. The
carpet on the back-stair MID landing reads greyish; it should be **light beige**.

The baked light on the kitchen floor is already warm (about 1.2 / 1.18 / 1.0), so the problem is the materials:

- `tile_kitchen.jpg` averages rgb(223, 218, 207), with fairly dark grout, at roughness 0.9. At that roughness it gets
  no reflections (materials at roughness 0.8 or more skip the env map), so it reads flat grey.
- `carpet_beige.jpg` averages rgb(189, 177, 162), which is too dark and too neutral to read as light beige under
  skylight.

**Fixes:**

1. **Kitchen tile.** Regenerate `textures/tile_kitchen.jpg`, its `_normal` and `_rough` maps.
   - Keep the same layout: **12"×12" tiles, a 4×4 grid per texture**, `repeat: 4`, 2048².
   - Glazed off-white porcelain averaging about rgb(240, 235, 224), with very faint mottling.
   - Thin (1/8") light grout, about `#d9d3c7`.
   - Set the `tileKitchen` material's roughness to about **0.35**, so it picks up the soft reflections the real glazed
     tile has.
   - Put the generator script in `tools/` (PIL). Keep the texture seamless.
   - The pantry and anything else using `tileKitchen` change with it; that's fine.
2. **Carpet.** Warm and lighten `textures/carpet_beige.jpg` in place: keep the pile detail, shift the mean to about
   **rgb(208, 195, 174)**. It's used everywhere carpet is (playroom, rear stairs, closets); that's intended.
3. **Bake side.** Note in the PR that the owner's bake step will re-check the skylight colour cast on the landing.

## 2. Back stairs: a dark line on every tread lip (still)

The round-2 fix added a probe-lit carpet **bullnose cylinder** on each carpet tread. In the bake it renders as a dark
olive band across every step. You can see it looking up the rear down-flight from the playroom (x 40.2, z 1.4, feet 0,
yaw −0.08, pitch −0.6).

The real rear stairs are **fully carpeted, waterfall style**: carpet runs over the tread and straight down the front of
the step. There's no separate nose, just a softly rounded edge.

**Fix, for carpet flights** (`finish: 'carpet'`: `rearUp`, `rearDown`):
- Remove the bullnose cylinders.
- No tread overhang.
- Build each step so its front is **one continuous vertical carpet face**, from the tread below up to this tread's top.
  Extend the riser box up to `top`, and let the tread box's top face cover only from the riser line back.
- Both faces stay lightmapped (the tall front face gets a healthy chart).
- For a soft edge, give the tread box a small bevel (about 0.03) rather than a separate primitive.
- Leave the oak flights as they are.

**Acceptance:** the pose above, plus one from the top of the rear up-flight looking down, shows plain carpeted steps
with no dark bands.

## 3. Hall-bath fixtures (Bath 1)

**Room layout.** `bath1`:
- rects `[21.3, 26.6, 0, 6.5]` and `[19.3, 26.6, 6.5, 11.7]`;
- door on the south wall at z 11.7, x 21.1–23.6;
- vanity `r: [19.5, 21.2, 7.1, 11.2]` on the west wall, facing east;
- tub `[21.5, 26.4, 0.2, 2.75]` in the alcove on the north wall, with the window over it;
- toilet at (22.5, 4.6), facing east.

**Finish:** brushed nickel (`'nickel'`) throughout.

### Vanity

- **Faucet:** replace the single faucet with a **widespread faucet**:
  - a centre spout;
  - two lever handles, 0.33 either side along z;
  - all on the deck behind the basin.
- **Top:** it must read as **white marble with soft grey veining** (Carrara-like). If `granite` / `granite_bath1.jpg`
  reads darker than that, add a `marbleWhite` material (a procedural or generated texture: a white base with grey
  veins) and use it for this vanity's top and 4" backsplash.
- **Mirror:**
  - Remove the 3-globe light bar above it. This bath is lit by the two recessed cans; there is no vanity light.
  - Make the mirror a **frameless three-door medicine cabinet**: a mirror surface the vanity's width, from about 0.5
    above the backsplash to about 3.6 above the counter, 0.12 proud of the wall, with two thin vertical seams dividing
    it into three doors, and a polished edge (a thin white/nickel edge band).
- **Cabinet:** white shaker, a centre pair of doors between two stacks of drawers. It's already roughly like this; check
  it still reads that way.

### Towels and accessories

- **Towel ring:** on the short return wall north of the vanity (the face at z ≈ 6.7, facing south), about
  x 20.4, y `MAIN + 4.4`. A 0.5-diameter ring hanging from a round 0.2 back plate.
- **Robe hooks:** a double hook on the wall **east of the door** (inside face, z ≈ 11.5), x ≈ 24.6, y `MAIN + 5.5`.

### Tub and shower

The plumbing wall is the **west end** of the tub alcove (x ≈ 21.5), and the niche is on the **east end**.

- **Tub spout:** at y `F + 2.1`, projecting 0.45.
- **Valve:** a round escutcheon (0.55 across) with a single lever, at y `F + 3.3`.
- **Shower arm and head:** at y `F + 6.4`, the arm angling down, the head 0.4 across.
- **Niche:** a recessed tile niche in the east end wall:
  - about 1.0 wide (along z, centred z ≈ 1.5), from `F + 3.6` to `F + 5.6`, 0.33 deep;
  - lined with the same `tileWall`, with a white pencil trim round the opening;
  - **two glass shelves** inside at `F + 4.3` and `F + 5.0` (use the transparent glass list, or a thin pale material).
- **Corner shelf:** a small white triangular shelf in the back (north-east) corner of the alcove, at `F + 3.4`.
- **Curtain:**
  - The tension rod becomes brushed nickel.
  - The curtain is a **grey and white ogee (teardrop-lattice) pattern**. Add a procedural `curtainOgee` texture: bands
    of mid-grey `#8f9296` and light grey `#c3c6ca` with white outlines.
  - Add a plain white liner behind it, a little longer.
  - Keep them bunched toward the west end as now.
- **Window over the tub:**
  - The tile **returns into the window opening** (jamb, head and sill in `tileWall`), with no wood casing on the tile
    face.
  - The glass is **frosted/obscure**.
  - Check the current `windowUnit` for this window and override it for this case.

### Toilet

- Replace the tank's side lever (if any) with a small round **chrome push button** on top of the tank lid.

**Acceptance:** views of the vanity wall, the tub alcove and the door wall. No fixture intersects tile, glass or the
skylight well.

## 4. Exterior: texture the outside of the house from the reference images

The owner has added two **reference images** (already redacted; don't try to un-redact or enhance them):

- `reference/outside_front.jpg`: street view of the front (the south face, z ≈ 30–35).
- `reference/outside_above.jpg`: aerial view of the roof. The front is at the bottom-left of that image.

**Read them**, then update `exterior()` in house.js and the exterior materials to match. What they show:

**Upper storey walls** (above the lower-level walls, on all sides):
- light cream/beige vinyl **shake siding**: cedar-impression shingles in straight courses, about 7" exposure;
- a colour near `#d8cfbb`;
- white corner boards.
- Replace the current plain lap `siding` procedural with a shake pattern (`procedural: 'shakes'`).

**Stone veneer:**
- The **lower storey front** (below the upper-floor line) and the **projecting entry bay** round the front door
  (full height to the roof) are **stacked ledgestone veneer**: mixed browns, tans, rust and grey, in horizontal
  rectangular stones.
- Add a `ledgestone` procedural texture.
- A thin cap/ledge where stone meets siding.

**Roof:**
- a **hip roof** in brown-tan architectural asphalt shingles, about `#9a7058` with dark shadow lines;
- white fascia, white soffits, white gutters.
- The aerial shows the hip form, three small skylights (match them to `SKYLIGHTS` where they exist; don't add rooms)
  and a small vent/chimney. Adjust the roof colour and texture to match; change the roof geometry only if it's clearly
  wrong against the aerial.

**Windows, doors and entry:**
- **Windows:** white vinyl frames and trim.
  - The upper-left pair on the front is two double-hung windows.
  - The bow window is on the right.
  - The lower-right has three windows in a row.
  - Check the exterior window trim is white and reads like the photo.
- **Front door:** dark mahogany with decorative glass and sidelights. This already exists; check the exterior view.
- **Stoop:**
  - wide steps with **bluestone treads** (blue-grey flagstone) on stone risers, flaring at the bottom;
  - **white vinyl railings** both sides;
  - a raised **stone planter bed wall** curving round the right side of the stoop's base, with low plantings.
- **Garage:** two white raised-panel sectional doors with white trim, stone piers between and beside them.

**Ground:**
- a dark asphalt driveway with a **grey paver border** (a soldier course);
- a concrete sidewalk with scored joints along the street;
- lawn elsewhere;
- a small patio pad at the rear (see the aerial);
- a white vinyl privacy fence along the rear and side lot lines (see the aerial).
- Keep it simple and low-poly.

**Rules:**
- Don't reproduce any map watermarks, text, house numbers, cars or neighbouring houses.
- The images are reference only: **don't load them at runtime**, and don't reference them from `index.html` or JS.

**Acceptance:** exterior shots from the street (in front of the driveway, looking north) and from above (a high camera,
looking down), compared side by side with the reference images in `review/`.

---

## Finish

1. Refresh `review/`.
2. Push `interior-accuracy`.
3. Add a "Round 4" section to PR #1's description: each item done, partial or skipped, with notes.
4. **Don't merge.** Before the owner publishes, the `reference/` and `review/` folders are removed; they must never
   reach `main`.
