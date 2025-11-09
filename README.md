<p align="center">
  <img src="./logo.png" alt="Zofia logo" width="150" />
</p>

# Zofia - Zero-Ops Framework for Intelligent Automation

Codename **Zofia** (Zero-Ops Framework for Intelligent Automation, named after the Rainbow Six Siege operator), this interactive visual pipeline dashboard is built with React Flow and Vite. It provides a polished UI for assembling, validating, and executing pipelines with a glassy look-and-feel, dark mode, and useful productivity touches.

## Features

- Bottom navbar
  - Nodes/Issues counter
  - Run/Stop with animated execution states and a live timer
  - Graph Check to validate connections (highlights nodes OK/bad)
  - Fit View, Zoom Out/Slider/In with percent readout
  - Interactive/Locked toggle
  - Theme toggle (Light/Dark)
  - Labels toggle (show/hide all button labels)
  - Screenshot button to export a high‑resolution PNG of the full dashboard
- MiniMap
  - Glass-styled MiniMap positioned at the top‑right
  - Used to generate a live preview for the Pipelines panel
- Left Dock
  - Pipelines panel with a highlighted Current pipeline card
    - Full-bleed image with bottom blur/caption bar
    - Other pipelines list with hover overlay (blur + “Load pipeline” action)
    - Gold pulse effect on click; current card also pulses on click
  - Nodes panel with categorized draggable previews
- Dark/Light theme via CSS variables; consistent icon/button styling

## Project Structure

- `src/App.jsx`
  - React Flow canvas, MiniMap, Background, and app state
  - Execution simulation, edges animation, issue counting
  - High‑res snapshot support (full dashboard capture with `html-to-image` if available, falling back to MiniMap)
- `src/index.css`
  - Theme variables and global styles
  - Bottom bar, left dock, pipelines cards, MiniMap styles
- `src/components/`
  - `BottomBar.jsx` – bottom navbar and actions (timer, labels toggle, screenshot)
  - `LeftDock.jsx` – Pipelines/Nodes/Outputs dock and Pipelines cards UI
  - `DashboardMenu.jsx`, `ContextMenu.jsx`, `Toast.jsx`, `ConfirmDialog.jsx`
- `src/nodes/`
  - `NodeCard.jsx` – custom React Flow node and `nodeStyles.css`
- `public/`, `src/assets/` – static assets

## Getting Started

- Install dependencies
  - `npm install`
- Run in development
  - `npm run dev` and open the local URL
- Build
  - `npm run build`
- Optional: enable full‑dashboard screenshots
  - `npm install html-to-image`
  - The Screenshot button will use full‑view capture; otherwise it falls back to a MiniMap image

## Usage Notes

- Run/Stop
  - Clicking Run starts simulated execution, animates edges, and swaps the icon to Stop; the timer appears at the far left
  - When execution finishes, the bar briefly highlights success/error, then resets
- Check
  - Validates required inputs/outputs per node and marks nodes OK/bad
- Pipelines panel
  - Current pipeline shows a live preview generated from the MiniMap
  - Hover any other pipeline to reveal the “Load pipeline” overlay; click pulses and closes the panel
- Labels toggle
  - Hides all bottom‑bar labels without affecting the timer (timer remains visible)

## Implementation Details

- React Flow: `nodeTypes` is defined outside the component to avoid dev warnings
- MiniMap preview: serialized SVG → high-DPI PNG via canvas
- Full dashboard screenshot: dynamic import of `html-to-image` and `toPng(rootEl, { pixelRatio })`
- Dark mode: toggled by `data-theme` attribute on `<html>` and CSS variables

## Node Attributes

- Dataset nodes expose fixed inputs: source type (file or folder), dataset type (PNG/JPEG, TIFF/TIF, NPY/NPZ – enabled when the source is a folder), phase (binary or multi-phase), and the maximum samples to load.
- Concat, Figure Vis, and Text Log nodes are structural only; they cannot be edited.
- Segmentation nodes allow selecting `otsu` or `EXP`. When `EXP` is chosen, an editor is shown for per-line `$p` expressions (`$p = 2; if $p > 0`, etc.).
- Filter nodes provide filter type (mean, median, gaussian, custom), kernel size, and an optional custom kernel grid activated when `custom` is selected.
- Structural Descriptor nodes include selectable descriptor checkboxes, dynamic numeric pixel values, a direction multi-select (X/Y/Z), lag distance, and a slider-controlled step (1–10).
- Simulation nodes offer a type selector for Diffusivity or Permeability.

## Pipeline Management

- Save the current graph to the browser's local storage; you can quick-save from the Pipeline panel, bottom bar, or canvas context menu.
- Load pipelines from the Pipelines tab: click any saved card to apply it. A glassy overlay blurs the dashboard while the pipeline is restored.
- Download exports the pipeline to a portable `.board` file (JSON envelope that preserves nodes, edges, styling, and runtime settings).
- Upload accepts `.board` files from disk, stores them locally, and asks whether to open the pipeline immediately.
- All quick actions are mirrored in the bottom toolbar, the left dock (Pipelines panel), and the dashboard context menu.

## Contributing

- Keep UI additions consistent with existing CSS variables and patterns in `src/index.css`
- Prefer lightweight effects (CSS transitions/animations) over heavy runtime logic

## How To Cite

If you reference this dashboard in academic work, please cite it as a software artifact. Replace placeholders with your details.

Plain text

- “Visual Pipeline Dashboard (React Flow). Version X.Y (accessed YYYY‑MM‑DD).”

BibTeX (template)

```
@software{visual_pipeline_dashboard,
  title   = {Dashboard pipeliner},
  author  = {Ali Aouf},
  year    = {2025},
  version = {0.1 pre},
  url     = {https://github.com/40uf411/dashboard-pipliner},
  note    = {Accessed: YYYY-MM-DD}
}
```

## License

This project builds on React, React Flow, and Vite. See their licenses for details. Check also the project license.
