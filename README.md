# Pixel Clouds

A local presentation editor with drifting blue pixel clouds and editable whitespace transitions.

## Open and run

Open `dist/index.html` directly in a modern browser. Keep its CSS and JavaScript files beside it. There are no dependencies or build steps.

For the local preview:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory dist
```

Visit http://127.0.0.1:8766/. An older prototype may already be using port 8765.

## Build a presentation

The bundled starter is **Rethink AI**, a nine-slide presentation with the supplied headings, lists, paragraphs, and source credits. It opens when there is no saved presentation; subsequent visits restore your edits. Its copy and starting layouts live in `dist/starter.js`.

- Rename the presentation using the name at the top of the sidebar.
- **Add slide** inserts a new slide after the selected one.
- Select a slide to edit its name, section label, heading, body text, and source credit in the **Slide** tab. Names organize the sidebar; the remaining fields appear on the slide. Section labels appear above the heading without a slide-number prefix.
- **Duplicate** copies the selected slide's text and layout into an independent slide.
- **Move earlier / Move later** reorder the selected slide. Text and whitespace stay attached to it.
- **Delete slide** removes it and updates neighboring transitions. Use the toast's Undo button or the header's undo/redo controls to recover it.
- Empty and single-slide presentations are supported. The editor supports up to 100 slides.
- Text stays upright inside the content safe area. The editor flags text that exceeds that area; shorten the copy or enlarge the whitespace.
- A body containing a single full web address becomes a clickable link that opens in a new tab.
- The tutoring slide includes a static blue QR code linking to `https://accytutor.com`. It sits beside the text on an opaque white card inside the safe area, separate from the animated canvas. **Show AccyTutor QR code** toggles it; duplication, reordering, and JSON exports keep it attached to the slide.
- **Present** starts at the first slide. Buttons, arrow keys, scrolling, and touch swipes advance through the current sequence. Escape returns to the editor.
- The **Layout samples** control previews illustrative title, metric, and chart layouts. These samples do not replace authored text, are not exported, and do not appear in Present mode.

## Edit transitions

Click **Cloud reshape** between any two slides, or use **Edit transition** beneath the canvas.

- Replay, pause, scrub, loop, or slow playback. The same timeline position produces the same frame.
- New transitions and the bundled presentation default to **0.8 seconds**. Timing remains editable; choosing a motion preset applies that preset's duration.
- Edit **Start**, **Middle**, and **End** whitespace position, width, height, and rotation.
- Slide endpoints are shared with their neighboring transitions. The midpoint is independent.
- **Continuous glide** carries the whitespace through the middle keyframe without an automatic pause. Custom reversals still turn smoothly at their waypoint.
- In **Motion**, choose **Float** (3.6s), **Flow** (2.8s), or **Quick** (1.6s) to compare timing and texture. Applying a preset replays the transition and can be undone. It preserves slide layouts, text, midpoint geometry, and the chosen base pixel size.
- Tune duration, movement curve, ripple, drift, peak drift, pixel size, texture refinement, and **Arrival settle**. The motion graph shows the shared build-and-settle envelope.
- Drift, ripple, and refinement rise gently and settle before the endpoint. Arrival settle also sets the incoming text's entrance window; outgoing text exits smoothly in the first 22%.
- Refinement subdivides anchored groups of cells instead of resizing the entire grid. Texture detail changes locally, without global retile jumps.
- Adjacent transitions share resting pixel size and drift speed (the average of their settings at a shared slide). Different motion settings therefore meet continuously.
- Ambient drift continues forward during backward navigation. Playback uses elapsed time, so expensive frames do not silently stretch the transition duration.
- All slides and transitions use the same blue, pale-blue, white, and checkered cloud palette. The former heat map, hue changes, and full-white clearing phase have been removed.
- Drift remains capped at 5×. There is no background opacity dissolve or parallax.
- Reordering/deleting slides retains settings for any adjacent pair that survives unchanged. New pairs receive a cloud transition with a midpoint between their slide layouts.
- Resetting a transition resets its timing/midpoint/motion and preserves the slides. Resetting a slide layout preserves its text.

Reduced-motion preferences disable ambient presentation drift and skip presentation transitions. Explicit replay in the editor remains available.

## Save, import, and undo

Edits autosave in this browser on this device. Use **Export** for a JSON backup and **Import** to restore one. Undo/redo covers slide CRUD, presentation names, text, geometry, motion, resets, and imports. History lasts for the current editor session.

Version 2 exports contain the presentation title, a dynamic slide list with text, and transitions referencing stable slide IDs. Version 1 exports are migrated automatically: authored whitespace/timing is preserved, the former heat transition becomes a calm blue-cloud reshape, and slides start with empty text.

Older version 2 saves gain the arrival-settle field. Untouched original motion defaults are refined automatically; custom duration, motion settings, and geometry are preserved.

The editor reads the prior browser save when no version 2 save exists. It writes the migrated presentation under a new storage key and leaves the version 1 save intact. Storage is specific to the address used to open the editor; it is not cloud synchronization.

Keyboard shortcuts: Cmd/Ctrl Z undo; Cmd/Ctrl Shift Z redo; R replay; Space play/pause outside form controls and buttons. Left/right arrows select slides in slide mode and step frames in transition mode. Native form controls keep their own keyboard behavior.

## Content roadmap

Heading and body text are editable now. Formatted headline metrics, editable charts, multiple independently positioned blocks, and custom entrance/exit timing remain future work. See [the content editor plan](docs/content-editor-plan.md).

## Source and checks

- `dist/index.html`: workspace and inspector.
- `dist/editor.css`: responsive editor and presentation view.
- `dist/model.js`: slide operations, sequence reconciliation, migration, validation, geometry, and timing.
- `dist/renderer.js`: seeded blue-cloud renderer.
- `dist/editor.js`: authoring, playback, autosave, history, and presentation.
- `tests/model.test.cjs`: slide CRUD, migration, import, geometry, and renderer regressions.

```sh
node --test tests/model.test.cjs
node --check dist/editor.js
node --check dist/renderer.js
```

## Publishing

GitHub Pages publishes the contents of `dist/` using `.github/workflows/pages.yml`. Each push to `main` runs the model tests and JavaScript syntax checks before deploying. You can also run **Publish GitHub Pages** manually from the repository's Actions tab.

The public app starts with the bundled nine-slide **Rethink AI** presentation. Browser edits remain local to each visitor and are not published automatically; update `dist/starter.js` and push to publish changes to the shared starter. JSON exports can be moved between the local editor and hosted app with **Import**. Local backups are excluded from Git.

`.openai/hosting.json` retains the original private Site identifier; GitHub Pages deployment is independent of that older Site preview.
