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

## Client side: why we ship a forked controller

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

### Approach we shipped: fork the controller

The install generator copies a forked `modal_controller.js` into the host app. The fork has one substantive change — a `#eventTarget()` helper that returns `this.turboFrame ?? this.element` — and routes the three dispatch sites through it. UTMR's npm package is still imported for its `turbo:frame-missing` / `turbo:before-frame-render` / `turbo:before-cache` side-effect handlers. The host app registers our forked controller as `"modal"` instead of UTMR's.

We also added one branch to `submitEnd`. UTMR's flow for a redirected form response is:

1. `submitEnd` stashes `_pendingRedirectUrl = response.url` and returns.
2. Turbo gives up trying to put the response in the modal frame because the redirect target doesn't contain that frame.
3. `turbo:frame-missing` fires on the modal frame.
4. UTMR's index.js handler reads `_pendingRedirectUrl` and runs a smooth-redirect (morph + close + navigate).

For static modals, step 3 never happens — there is no frame. So we added: when `!this.turboFrame && response.redirected`, close the modal with `hideModalWithPromise({ skipHistoryBack: true })` and then `Turbo.visit(response.url)` directly.

## Tests

`javascript/modal_controller.test.js` exercises the two patches we own:

1. `hideModal` without a `<turbo-frame>` ancestor dispatches `modal:closing` on `this.element` and doesn't throw.
2. `submitEnd` with a redirected response and no `<turbo-frame>` triggers `Turbo.visit(response.url)` after closing.
3. (Regression guard) `submitEnd` with a `<turbo-frame>` present still stashes `_pendingRedirectUrl` so UTMR's normal smooth-redirect flow continues to work.

The tests use `node:test` + `happy-dom` + a real Stimulus `Application.start()` so the controller goes through the actual connect/disconnect lifecycle. The controller source is loaded from the install-generator template — there's no separate test copy that could drift.

## Drift risk

The controller file is a verbatim copy of UTMR's `modal_controller.js` plus the patches above. When UTMR releases a new version of that file, we'll need to re-fork: copy the new version, re-apply the `#eventTarget()` and `submitEnd` patches, run the tests. The tests are designed to fail loudly if the patches go missing during that process.

The longer-term fix is to upstream the null-safe behavior into UTMR. The change is tiny (~5 lines), benefits anyone using UTMR's controller outside a Turbo-Frame context, and would let this gem drop the forked controller entirely.

## What this gem is NOT

- A general modal library. The animations, focus trapping, scroll lock, and ESC handling are all UTMR's. We're a thin server-and-distribution adapter.
- A replacement for UTMR. If your modal has its own URL (forms, show pages, anything Rails-rendered), use UTMR's `modal()` directly. Static modals are the leftover use case.
- A long-term fork. If UTMR adopts the null-safe controller change, this gem shrinks back to a pure server-side helper add-on.
