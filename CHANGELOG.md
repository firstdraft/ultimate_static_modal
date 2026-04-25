# Changelog

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
