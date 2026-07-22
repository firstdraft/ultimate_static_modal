# Changelog

## 0.2.0 — 2026-07-22

- Replaced the copied UTMR Stimulus controller with a small subclass adapter,
  so static and Turbo-backed modals inherit the installed UTMR controller's
  fixes and features.
- Added integration coverage against the published UTMR JavaScript package for
  both frameless and Turbo Frame-backed dialogs.
- Updated the install generator to follow UTMR's current `index.js` and
  `application.js` Stimulus layouts, with generator integration coverage.
- Raised the supported UTMR range to 3.2.1 or newer within the 3.x series.

## 0.1.0 — 2026-04-24

Initial release.

- View helpers for static (non-Turbo) modals and drawers that reuse
  `ultimate_turbo_modal`'s Phlex chrome and configured flavor classes:
  `static_modal`, `static_drawer`, `static_modal_template`,
  `static_drawer_template`, `static_modal_trigger`.
- Install generator (`rails g ultimate_static_modal:install`) that copies a
  `static-modal` Stimulus controller (template-cloner) into the host app and
  registers it.
- Ships a forked copy of UTMR's `modal_controller.js` so dialogs that have no
  enclosing `<turbo-frame>` can dispatch close events on `this.element` and
  redirected form submissions can navigate via `Turbo.visit` instead of
  dead-ending in a `turbo:frame-missing` handler that never fires. The host
  app's UTMR npm package is still imported for its
  `turbo:frame-missing` / `before-frame-render` / `before-cache` side-effects.
