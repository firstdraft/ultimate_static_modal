# Architecture

This document explains *why* `ultimate_static_modal` looks the way it does. If you just want to use the gem, [README.md](README.md) is enough.

## What we're solving

UTMR's `modal()` / `drawer()` helpers render a `<dialog>` only when the request comes from a Turbo Frame (i.e., carries a `Turbo-Frame: modal` header). On a plain page request — or anywhere you call the helper without a request at all — the helper falls back to rendering just the block contents inline, no chrome.

That's a deliberate design choice in UTMR: every modal is a URL, server-rendered into a frame. Great for forms and CRUD views. Wrong for one-off in-page UI like a help popover or a nav drawer.

## Server side: skip the `turbo_frame?` guard

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

That's it. We dynamically subclass whichever flavor UTMR is configured with (Tailwind, vanilla, custom) and replace `view_template` with one that always renders the dialog. Class constants, inline `<style>`, data attributes, and Phlex composition all come from UTMR unchanged. If UTMR adds a new option or restructures the chrome, we inherit it for free.

## Client side: why we ship an adapter

UTMR's Stimulus controller assumes every `<dialog>` it manages has a `<turbo-frame>` ancestor. Three places dispatch lifecycle events on that frame:

```js
this.turboFrame = this.element.closest('turbo-frame');
// ...
this.turboFrame.dispatchEvent(event);
```

For a static modal, `closest('turbo-frame')` returns `null`. `hideModal` then does:

```js
hideModal({ skipHistoryBack = false } = {}) {
  if (this.hidingModal) return false;
  this.hidingModal = true;                      // <-- set BEFORE the throw
  let event = new Event('modal:closing', { cancelable: true });
  this.turboFrame.dispatchEvent(event);          // <-- TypeError: null
  // ...
}
```

First click sets `this.hidingModal = true` and then throws. Second click hits `if (this.hidingModal) return false` and short-circuits. The modal becomes un-closeable.

### Approach we considered first: wrap in a sentinel `<turbo-frame>`

Earlier prototypes wrapped each rendered dialog in a `<turbo-frame id="modal">` that had no `src` and never navigated. That made `closest('turbo-frame')` find something, the dispatch worked, the close button worked.

But it broke navigation. Turbo's frame routing intercepts any `<a>` click inside a `<turbo-frame>` and tries to swap the response into a frame with the matching `id`. Our drawer's `<a href="/settings">` would fetch `/settings`, find the empty `<turbo-frame id="modal">` in the layout, and swap *that* into our drawer — drawer goes blank, page stays put. The user-visible failure is a drawer that disappears when you click anything.

You can't fix this with `data-turbo-frame="_top"` on every link without making it the user's job to remember it on every link inside any static modal. Wrong tradeoff.

### Approach we shipped: subclass the controller

UTMR exports its Stimulus controller, so the install generator copies a small subclass into the host app instead of copying UTMR's source. The host app registers that adapter as `"modal"`:

```js
import { UltimateTurboModalController } from "ultimate_turbo_modal"

export default class extends UltimateTurboModalController {
  connect() {
    super.connect()

    this.frameless = !this.turboFrame
    if (this.frameless) this.turboFrame = this.element
  }
}
```

UTMR sets `turboFrame` during `connect()`, but does not need it until the close flow begins. The adapter records whether the dialog was frameless and, in that case, points `turboFrame` at the dialog itself. UTMR's inherited lifecycle methods can then dispatch and listen on that element without any copied implementation. Framed dialogs keep their real Turbo Frame and follow the upstream path unchanged.

We also added one branch to `submitEnd`. UTMR's flow for a redirected form response is:

1. `submitEnd` stashes `_pendingRedirectUrl = response.url` and returns.
2. Turbo gives up trying to put the response in the modal frame because the redirect target doesn't contain that frame.
3. `turbo:frame-missing` fires on the modal frame.
4. UTMR's index.js handler reads `_pendingRedirectUrl` and runs a smooth-redirect (morph + close + navigate).

For static modals, step 3 never happens — there is no frame. The adapter therefore overrides only `submitEnd`: when a frameless dialog receives a redirected response, it closes with `hideModalWithPromise({ skipHistoryBack: true })` and then calls `Turbo.visit(response.url)`. Every other submission delegates to UTMR.

## Tests

`javascript/modal_controller.test.js` exercises the adapter against the actual published UTMR package:

1. The installed controller is an instance of UTMR's exported controller and inherits current upstream methods.
2. `hideModal` without a `<turbo-frame>` ancestor dispatches `modal:closing` on the dialog and doesn't throw.
3. `submitEnd` with a redirected response and no `<turbo-frame>` triggers `Turbo.visit(response.url)` after closing.
4. A controller with a `<turbo-frame>` ancestor preserves UTMR's normal event target and smooth-redirect setup.

The tests use `node:test` + `happy-dom` + a real Stimulus `Application.start()` so the adapter and upstream controller go through the actual connect/disconnect lifecycle. The adapter source is loaded from the install-generator template, while `ultimate_turbo_modal` resolves from npm just as it does in a host app.

The Ruby generator tests cover both Stimulus layouts recognized by UTMR 3.2.1:
an `index.js` that starts the application directly and the standard split layout
where `Application.start()` lives in `application.js`. In both cases the test
verifies that UTMR's registration is replaced by the adapter.

## Drift risk

There is no copied UTMR implementation to rebase. The adapter still relies on UTMR exporting `UltimateTurboModalController`, setting `turboFrame` during `connect()`, and exposing `submitEnd` and `hideModalWithPromise`. The gem therefore requires UTMR 3.2.1 or newer within the 3.x series, and the JavaScript tests pin the same published package version. Before widening that range or adopting UTMR 4, update the test dependency and run the integration suite.

## What this gem is NOT

- A general modal library. The animations, focus trapping, scroll lock, and ESC handling are all UTMR's. We're a thin server-and-distribution adapter.
- A replacement for UTMR. If your modal has its own URL (forms, show pages, anything Rails-rendered), use UTMR's `modal()` directly. Static modals are the leftover use case.
- A source fork. Static dialogs use a small subclass of the installed UTMR controller, so upstream fixes remain available to both static and Turbo-backed modals.
