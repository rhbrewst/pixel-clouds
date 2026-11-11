# Slide content editor plan

The presentation editor now supports slide creation, duplication, renaming, reordering, deletion, and editable heading/body text. Text is saved per slide and rendered inside an upright safe area. The next content release should add headline numbers, editable charts, and independent blocks. Layout samples remain illustrative previews.

## Structure

Keep three independent layers:

1. **Background:** the existing Canvas renderer, including pixel texture, color, and whitespace keyframes.
2. **Content:** an accessible HTML layer for text and metrics, with SVG charts. Do not paint editable text into the background canvas.
3. **Timing:** normalized exit and entrance windows attached to each transition. Current behavior: outgoing content leaves smoothly during the first 22%; incoming content enters during the transition’s Arrival settle window (28% for Flow). Independent per-block timing remains planned.

A slide owns its whitespace endpoint and its content. A transition references two slide IDs and owns the intermediate whitespace path and timing. This makes a slide's layout consistent when approaching it from either direction.

## Next release: add and edit blocks

Extend the existing Slide inspector using the same stage and slide sequence. Add three insert actions:

- **Text:** title, subtitle, paragraph, and caption. Controls for font, size, weight, line height, color, alignment, and block width. Support plain text editing first; allow a small rich-text toolbar later.
- **Number:** a numeric value with prefix/suffix, precision, label, and optional comparison. Store the value as a number with formatting settings so changes in units or precision are reliable. Count-up animation should be optional.
- **Chart:** bar and line charts with a small editable data table or pasted CSV. Controls for title, units, axis limits, labels, series colors, legend, and source caption. Keep the data table accessible. Support an SVG/PNG figure with alt text and a caption after native charts.

Use text + chart, headline number + context, and title + body as starting layouts. The user can then move, resize, duplicate, reorder, and delete individual blocks.

## Placement and readability

Store block bounds as normalized coordinates relative to a slide's content safe area, rather than screen pixels. Let users opt into a slide-relative anchor for a figure that deliberately extends beyond that area.

Keep text and charts upright by default even if the whitespace rotates. Position each slide's content in its own final layout; do not rotate it automatically with the background. Use the transition's exit/entrance windows to hide content while the available space changes. A “follow whitespace” option can come later.

Show warnings for overflow, undersized type, and overlapping blocks. Fit-to-space should be explicit, with a minimum type size; never silently shrink text until it is unreadable. Include presentation and narrow-screen previews.

The current safe-area guide is a conservative upright rectangle inside the rotated opening, clipped to the slide bounds. It is a placement aid; final authored text still needs overflow and contrast checks.

## Proposed data shape

The current version 2 format stores presentation titles, stable slide IDs, heading/body text, and dynamic transition references. Version 1 is already migrated automatically. Introduce version 3 for independent blocks, migrating each existing heading/body into text blocks and preserving slide IDs and transitions.

Example of a proposed slide (not the current import format):

```json
{
  "id": "space",
  "space": { "x": 32.5, "y": 51, "width": 57, "height": 72, "rotation": 0 },
  "blocks": [
    {
      "id": "headline",
      "type": "text",
      "anchor": "safe-area",
      "bounds": { "x": 0, "y": 0, "width": 1, "height": 0.25 },
      "content": "A clearer perspective.",
      "style": { "role": "heading", "align": "left" }
    },
    {
      "id": "metric",
      "type": "metric",
      "anchor": "safe-area",
      "bounds": { "x": 0, "y": 0.3, "width": 1, "height": 0.5 },
      "value": 72,
      "format": { "suffix": "%", "decimals": 0 },
      "label": "Example metric"
    }
  ]
}
```

Chart blocks should store structured data, labels, units, chart type, styling, and a source caption. Give all block types stable IDs so undo/redo, copying, timing, and later animations remain predictable.

## Recommended order

1. Expand the current heading/body fields into a block model with selection handles and starter layouts. Extend the existing undo/redo and export/import behavior.
2. Add formatted metrics and bar/line charts with editable data.
3. Add a content timing track beneath the whitespace track: exit, background change, entrance. Include a frame-by-frame readability preview.
4. Add figure imports, alignment guides, duplicate layouts, and reusable presets.

Useful follow-up features for the transition editor: save named presets, duplicate a transition's settings, compare an edited version with its previous state, and add/move keyframes beyond the current start/middle/end structure. These should follow the first content editor rather than delay it.
