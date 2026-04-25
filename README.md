# ultimate_static_modal

Render [ultimate_turbo_modal](https://github.com/cmer/ultimate_turbo_modal)'s polished modal and drawer chrome on content that doesn't need to come from the server. Help popovers, confirmation dialogs, navigation drawers, on-page filter UIs — anything that doesn't deserve its own URL.

[![Gem Version](https://img.shields.io/gem/v/ultimate_static_modal.svg)](https://rubygems.org/gems/ultimate_static_modal)

> Visual examples of the modal and drawer chrome live in [UTMR's README](https://github.com/cmer/ultimate_turbo_modal#readme) — this gem renders identical chrome.

## Why this exists

UTMR is built for server-driven modals: you click a link, Rails renders the modal contents into a Turbo Frame, the dialog opens. That's a great pattern for forms, show pages, or anything else with real server state.

But sometimes you just want a modal — no route, no controller action, no Turbo Frame — and you want it to look exactly like the rest of your modals. UTMR's `modal()` helper short-circuits when there's no `Turbo-Frame` header on the request, so it can't render those. This gem fills the gap.

## Requirements

You need [ultimate_turbo_modal](https://github.com/cmer/ultimate_turbo_modal) v3+ already installed and working in your Rails app. If `link_to ..., data: { turbo_frame: "modal" }` already opens a working modal, you're good. If not, install UTMR first.

## Quickstart

### 1. Install the gem

```ruby
# Gemfile
gem "ultimate_static_modal"
```

```sh
bundle install
bin/rails generate ultimate_static_modal:install
```

The generator copies two Stimulus controllers into `app/javascript/controllers/` and wires them up in `controllers/index.js`. Rebuild your JS bundle and restart Rails.

### 2. Add a modal to any page

```erb
<%# Anywhere in a view %>
<%= static_modal_template("hello", title: "Hello there") do %>
  <p>This is a static modal. No round-trip to the server.</p>
<% end %>

<%= static_modal_trigger("hello", class: "px-4 py-2 rounded bg-indigo-600 text-white") do %>
  Open the modal
<% end %>
```

### 3. Click the button

The button clones the `<template>` into the page, the modal animates open, ESC / close button / outside-click all dismiss it. Done.

## Common scenarios

### Keyboard shortcuts / help dialog

```erb
<%= static_modal_template("shortcuts", title: "Keyboard shortcuts") do %>
  <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
    <dt class="font-mono">?</dt><dd>Open this dialog</dd>
    <dt class="font-mono">g h</dt><dd>Go home</dd>
    <dt class="font-mono">/</dt><dd>Focus search</dd>
  </dl>
<% end %>

<%= static_modal_trigger("shortcuts", class: "...") do %>
  Keyboard shortcuts
<% end %>
```

### Confirmation dialog

```erb
<%= static_modal_template("confirm-delete", title: "Are you sure?") do |m| %>
  <% m.footer do %>
    <div class="flex justify-end gap-2 w-full">
      <button type="button" data-action="modal#hideModal" class="...">Cancel</button>
      <%= button_to "Delete", thing_path(@thing), method: :delete, class: "..." %>
    </div>
  <% end %>
  <p>This will permanently delete <strong><%= @thing.name %></strong>. This cannot be undone.</p>
<% end %>

<%= static_modal_trigger("confirm-delete", class: "text-red-600") do %>
  Delete…
<% end %>
```

`data-action="modal#hideModal"` on the Cancel button calls UTMR's modal Stimulus controller to dismiss the dialog. (Pulled in by the install generator — you don't need to wire it up.)

### Navigation drawer (offcanvas)

```erb
<%= static_drawer_template("nav", position: :left, size: :lg, title: "Navigation") do %>
  <ul class="space-y-2">
    <li><%= link_to "Home", root_path, data: { turbo_frame: "_top" } %></li>
    <li><%= link_to "Settings", settings_path, data: { turbo_frame: "_top" } %></li>
  </ul>
<% end %>

<%= static_modal_trigger("nav", class: "...") do %>
  ☰ Menu
<% end %>
```

The `data: { turbo_frame: "_top" }` is important — without it, Turbo can capture in-drawer link clicks and route them into the layout's empty modal frame instead of navigating the page. See [Troubleshooting](#troubleshooting).

### Filter sidebar (no overlay)

```erb
<%= static_drawer_template("filters", position: :right, title: "Filters", overlay: false) do %>
  <%# Your filter form here. Stays visible without dimming the page behind it. %>
<% end %>
```

## Helpers

| Helper | What it does |
| --- | --- |
| `static_modal_template(id, **opts, &block)` | Emits a `<template id="…">` wrapping a static modal. |
| `static_drawer_template(id, **opts, &block)` | Emits a `<template id="…">` wrapping a static drawer. |
| `static_modal_trigger(template_id, **html_opts, &block)` | Emits a `<button>` that clones the template into the DOM on click. Works for both modals and drawers. |
| `static_modal(**opts, &block)` | Renders the bare `<dialog>` markup with no `<template>` wrap. Use only when you're wrapping it yourself. |
| `static_drawer(**opts, &block)` | Same, but for drawers. |

All `**opts` accept everything UTMR's `modal()` / `drawer()` accept, including the block DSL (`m.title { … }`, `m.footer { … }`).

## Options

These pass through to UTMR's flavor classes — see [UTMR's README](https://github.com/cmer/ultimate_turbo_modal#configuration-options) for the full list. The most useful ones:

| Option | Default | Description |
| --- | --- | --- |
| `title:` | `nil` | Title text rendered in the header |
| `header:` | `true` | Show the header bar at all |
| `header_divider:` | `true` (modal) / `false` (drawer) | Show a divider line under the header |
| `footer_divider:` | `true` | Show a divider line above the footer |
| `close_button:` | `true` | Show the X button |
| `padding:` | `true` | Pad the body content |
| `overlay:` | `true` | Dim the rest of the page when open |
| `position:` | `:right` (drawer only) | `:right` or `:left` |
| `size:` | `:md` (drawer only) | `:xs`, `:sm`, `:md`, `:lg`, `:xl`, `:"2xl"`, `:full`, or any CSS length string |

## Troubleshooting

**Nothing happens when I click the trigger button.**

Most likely you skipped a step after installing:
- Did the generator run? You should see `app/javascript/controllers/static_modal_controller.js` and `modal_controller.js` and a `register("static-modal", …)` line in `controllers/index.js`.
- Did you rebuild your JS bundle? (`npm run build`, or whatever your bundler command is.)
- Did you restart Rails? View helpers are loaded by a Railtie, which only runs on boot.

**The button has no background color (or text is invisible).**

If you used a Tailwind utility class that wasn't in any other file before, Tailwind hasn't compiled it yet. Rebuild your CSS bundle (`npm run build:css`).

**`NoMethodError: undefined method 'static_modal_template' for #<...>`**

Restart Rails. The helper module is included into `ActionView::Base` by a Railtie at boot time.

**Links inside a static drawer don't navigate — the drawer just blanks out.**

Add `data: { turbo_frame: "_top" }` to the link. Turbo's frame routing assumes any `<a>` inside a "modal" context targets a Turbo Frame named `modal`, and your layout almost certainly has an empty `<turbo-frame id="modal">` waiting. The `_top` target tells Turbo to navigate the whole page instead.

## How it works (short version)

Server side: a tiny Phlex subclass overrides UTMR's `view_template` to skip the `turbo_frame?` guard, so the dialog markup renders unconditionally. About 15 lines of Ruby.

Client side: the install generator ships a `static-modal` Stimulus controller (clones a `<template>` on click) and a forked copy of UTMR's `modal_controller.js` with one substantive patch — close events fall back to `this.element` when there's no enclosing `<turbo-frame>`. Without that patch, the close button breaks on first click for any UTMR dialog rendered outside a frame.

For the long version, including why we don't just wrap the dialog in a sentinel `<turbo-frame>`, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Status

Experimental but stable enough to use. Actively dogfooded. The plan is to propose folding the null-safe controller behavior upstream into UTMR; if that lands, this gem drops the forked controller and shrinks to just the view helpers.

## Development

```sh
# JS unit tests for the forked controller
cd javascript && npm install && npm test
```

There's no Ruby test suite. UTMR has none either, and the gem is small enough that the JS tests plus manual smoke-testing in a host app cover the load-bearing behavior.

## Contributing

Issues and PRs welcome at <https://github.com/firstdraft/ultimate_static_modal>.

## License

MIT — see [LICENSE.txt](LICENSE.txt).
