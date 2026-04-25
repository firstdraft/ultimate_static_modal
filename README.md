# ultimate_static_modal

Static-content companion to [ultimate_turbo_modal](https://github.com/cmer/ultimate_turbo_modal) (UTMR).

UTMR renders its `<dialog>` chrome only when the request carries a `Turbo-Frame` header. This gem adds view helpers that render the same chrome — and reuse UTMR's configured flavor classes — for modals and drawers whose content is *not* loaded via a Turbo Frame. Use it for help popovers, client-side confirms, navigation drawers, and other one-off modals that don't warrant their own route.

## Installation

```ruby
# Gemfile
gem "ultimate_turbo_modal"   # follow its install instructions first
gem "ultimate_static_modal"
```

After installing UTMR (`rails g ultimate_turbo_modal:install`), run our installer:

```sh
bin/rails generate ultimate_static_modal:install
```

This:

1. Copies a small `static-modal` Stimulus controller into `app/javascript/controllers/static_modal_controller.js` (clones a `<template>` into the DOM on click).
2. Copies a patched `modal_controller.js` next to it (a fork of UTMR's controller — see *Why we ship a forked controller* below).
3. Updates `app/javascript/controllers/index.js` to register both controllers and replace UTMR's modal registration with the forked version, while still importing UTMR's npm package for its Turbo event side-effects.

Rebuild your JS bundle and restart Rails.

## Usage

Three view helpers cover the common pattern: parking the modal markup inside a `<template>`, plus a button that clones it on click.

```erb
<%# Modal %>
<%= static_modal_template("shortcuts", title: "Keyboard shortcuts") do |m| %>
  <% m.footer do %>
    <button type="button" data-action="modal#hideModal">Close</button>
  <% end %>
  <dl>
    <dt>?</dt><dd>Show this dialog</dd>
    <dt>g h</dt><dd>Go home</dd>
  </dl>
<% end %>

<%# Drawer / offcanvas %>
<%= static_drawer_template("filters", position: :right, size: :lg, title: "Filters") do |m| %>
  <p>Anything goes here.</p>
<% end %>

<%# Trigger button (works for both) %>
<%= static_modal_trigger("shortcuts", class: "btn btn-primary") do %>
  Keyboard shortcuts
<% end %>
```

The trigger emits a `<button>` wired to the `static-modal` Stimulus controller:

```html
<button type="button" class="btn btn-primary"
        data-controller="static-modal"
        data-static-modal-id-value="shortcuts"
        data-action="click->static-modal#open">
  Keyboard shortcuts
</button>
```

When clicked, it clones the `<template>` content into `document.body`. UTMR's modal Stimulus controller (the forked copy) then connects to the cloned `<dialog>` and animates it open. ESC, the close button, and outside-clicks all dismiss as usual.

### Lower-level helpers

If you need to render a dialog directly (no `<template>` wrap, no trigger), use:

```erb
<%= static_modal(title: "…") do |m| %>…<% end %>
<%= static_drawer(position: :right, size: :md, title: "…") do |m| %>…<% end %>
```

These accept every option UTMR's `modal()` / `drawer()` helpers accept, including the `m.title { … }` / `m.footer { … }` block DSL. The dialog opens immediately on connect, so they're typically only useful inside a `<template>` you'll clone yourself, or wrapped in your own conditional rendering.

### Drawer sizes and positions

`static_drawer` / `static_drawer_template` accept the same options UTMR supports: `position: :right` or `:left`, and `size: :xs`, `:sm`, `:md`, `:lg`, `:xl`, `:"2xl"`, `:full`, or any CSS length string.

### Header, footer, dividers, overlay

All of UTMR's options pass through:

- `title:` — modal/drawer title text
- `header: false` — hide the header entirely
- `header_divider: false` / `footer_divider: false` — turn dividers off
- `close_button: false` — hide the close button
- `overlay: false` — undimmed backdrop
- `padding: false` — remove content padding

## How it works

```ruby
module UltimateStaticModal
  def build_static_subclass(flavor_class)
    Class.new(flavor_class) do
      def view_template(&block)
        drawer? ? render_drawer(&block) : render_modal(&block)
      end
    end
  end
end
```

That's the entire server-side mechanism: a runtime subclass of whatever flavor UTMR is configured with (Tailwind, vanilla, custom), with `view_template` overridden to skip UTMR's `turbo_frame?` early-return. Class constants, inline `<style>`, data attributes, and Phlex rendering all come straight from UTMR.

## Why we ship a forked controller

UTMR's Stimulus controller assumes every `<dialog>` it manages is wrapped in a `<turbo-frame>` (because every dialog UTMR itself renders *is* wrapped in one). Three places dispatch lifecycle events on that frame:

```js
this.turboFrame.dispatchEvent(event);  // throws if turboFrame is null
```

For static modals, there is no enclosing frame. On the first close attempt, `hideModal` sets `this.hidingModal = true` and *then* throws on `dispatchEvent`. Every click after that is short-circuited by the `if (this.hidingModal) return false` guard, so the modal becomes un-closeable.

We could wrap our static dialogs in a sentinel `<turbo-frame id="modal">` that never navigates — and an earlier prototype did exactly that — but Turbo's frame routing then traps any `<a>` or `<button>` inside the modal and tries to swap their target into the layout's empty modal frame. Drawer nav links blanked out instead of navigating the page.

Instead we ship a fork of `modal_controller.js` with a single substantive change: a `#eventTarget()` helper that returns `this.turboFrame ?? this.element`. All three dispatch sites route through it. We also added one branch to `submitEnd`: when a redirected form response comes back and there's no `<turbo-frame>` ancestor, close the modal with a promise and `Turbo.visit(response.url)` directly — UTMR's normal flow defers this to a `turbo:frame-missing` handler that won't fire without a frame.

The two patches are exercised by `javascript/modal_controller.test.js`, which also includes a regression guard ensuring the new `submitEnd` branch is correctly gated on `!this.turboFrame` (so UTMR's normal redirect flow is preserved when a frame *is* present).

If UTMR adopts an equivalent change upstream, this fork goes away and the gem becomes a pure server-side add-on.

## Status

Experimental. Used in production-adjacent projects and being dogfooded. The plan is to propose folding the null-safe controller behavior into UTMR itself; if that lands, this gem drops the forked controller and shrinks to just the view helpers.

## Development

```sh
# JS unit tests for the forked controller
cd javascript && npm install && npm test
```

The Ruby gem has no test suite. UTMR also has none, and the gem is small enough that the JS tests plus manual smoke-testing in a host app cover the load-bearing behavior.

## License

MIT — see [LICENSE.txt](LICENSE.txt).
