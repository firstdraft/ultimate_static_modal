// Tests for the two patches we own on top of UTMR's modal_controller.js:
//
//   1. #eventTarget() falls back to this.element when this.turboFrame is null,
//      so hideModal() can dispatch modal:closing without an enclosing
//      <turbo-frame>.
//   2. submitEnd() handles redirected responses without a <turbo-frame> by
//      closing the modal and calling Turbo.visit, instead of stashing the URL
//      for a turbo:frame-missing handler that will never fire.
//
// These are the only places where our fork meaningfully diverges from UTMR.
// If they regress (e.g. during a re-fork against newer UTMR), close behaviour
// breaks silently for static modals.

import { test, before, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { Window } from "happy-dom"
import { Application } from "@hotwired/stimulus"
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTROLLER_PATH = join(
  __dirname,
  "..",
  "lib",
  "generators",
  "ultimate_static_modal",
  "templates",
  "modal_controller.js"
)

let ModalController

before(async () => {
  // Set up a happy-dom window/document and the globals the controller touches.
  const window = new Window({ url: "https://example.test/" })
  const document = window.document
  globalThis.window = window
  globalThis.document = document
  globalThis.HTMLElement = window.HTMLElement
  globalThis.Element = window.Element
  globalThis.Event = window.Event
  globalThis.Node = window.Node
  globalThis.MutationObserver = window.MutationObserver
  globalThis.NodeFilter = window.NodeFilter
  globalThis.ErrorEvent = window.ErrorEvent
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  globalThis.history = window.history

  // The controller imports `@hotwired/stimulus` from the package name. Rewrite
  // that to a resolvable file URL so we can dynamic-import it from a temp file.
  const stimulusEntry = pathToFileURL(
    join(__dirname, "node_modules", "@hotwired", "stimulus", "dist", "stimulus.js")
  )
  const src = readFileSync(CONTROLLER_PATH, "utf8")
  const rewritten = src.replace(
    /from\s+["']@hotwired\/stimulus["']/,
    `from "${stimulusEntry.href}"`
  )

  const tmp = mkdtempSync(join(tmpdir(), "ultimate-static-modal-"))
  const tmpFile = join(tmp, "modal_controller.mjs")
  writeFileSync(tmpFile, rewritten)
  const mod = await import(pathToFileURL(tmpFile).href)
  ModalController = mod.default
})

let app
let dialog
let controller

beforeEach(async () => {
  document.body.innerHTML = ""
  document.body.removeAttribute("data-turbo-modal-history-advanced")

  // Build a dialog that matches the chrome our gem renders, minus the
  // <turbo-frame> wrapper. This is the "static modal" topology.
  dialog = document.createElement("dialog")
  dialog.id = "modal-container"
  dialog.setAttribute("data-controller", "modal")
  dialog.setAttribute("data-modal-target", "container")

  const inner = document.createElement("div")
  inner.id = "modal-inner"
  const content = document.createElement("div")
  content.id = "modal-content"
  content.setAttribute("data-modal-target", "content")
  inner.appendChild(content)
  dialog.appendChild(inner)
  document.body.appendChild(dialog)

  // Stub the native dialog APIs happy-dom doesn't implement.
  dialog.showModal = () => { dialog.setAttribute("open", "") }
  dialog.close = () => { dialog.removeAttribute("open") }

  app = Application.start()
  app.register("modal", ModalController)

  // Wait a tick for Stimulus to wire up the controller and run connect().
  await new Promise((r) => setTimeout(r, 0))

  controller = app.getControllerForElementAndIdentifier(dialog, "modal")
  assert.ok(controller, "controller should be connected")
  assert.equal(controller.turboFrame, null, "no <turbo-frame> ancestor in this topology")

  // Pretend the modal has finished entering so closing has a clean starting
  // state. We're not testing the enter animation here.
  dialog.setAttribute("data-entered", "")
})

test("hideModal without a <turbo-frame> ancestor dispatches modal:closing on the element and does not throw", () => {
  let captured = null
  dialog.addEventListener("modal:closing", (event) => {
    captured = event
  })

  assert.doesNotThrow(() => controller.hideModal())
  assert.ok(captured, "modal:closing event was dispatched")
  assert.equal(captured.cancelable, true)
  assert.equal(controller.hidingModal, true)
})

test("submitEnd: redirected response without a <turbo-frame> closes the modal then Turbo.visits the redirect URL", async () => {
  const visited = []
  window.Turbo = { visit: (url) => visited.push(url) }

  // We're not exercising the close animation here — that's UTMR's territory.
  // Stub the close path to resolve immediately and verify the new branch
  // actually wires into Turbo.visit.
  let promiseResolved = false
  controller.hideModalWithPromise = (opts) => {
    promiseResolved = true
    controller._lastHidePromiseOpts = opts
    return Promise.resolve()
  }

  controller.submitEnd({
    detail: {
      success: true,
      fetchResponse: {
        response: { redirected: true, url: "/after-submit" }
      }
    }
  })

  // Let the promise chain settle.
  await new Promise((r) => setTimeout(r, 0))

  assert.equal(promiseResolved, true, "hideModalWithPromise was called")
  assert.deepEqual(controller._lastHidePromiseOpts, { skipHistoryBack: true })
  assert.deepEqual(visited, ["/after-submit"])
})

test("submitEnd: redirected response with a <turbo-frame> ancestor stashes the URL (regression guard for the UTMR path)", () => {
  // Sanity check that our patch is gated on `!this.turboFrame` and we don't
  // accidentally Turbo.visit when UTMR's normal frame-missing flow should run.
  controller.turboFrame = document.createElement("turbo-frame")

  const visited = []
  window.Turbo = { visit: (url) => visited.push(url) }

  controller.submitEnd({
    detail: {
      success: true,
      fetchResponse: {
        response: { redirected: true, url: "/should-not-visit" }
      }
    }
  })

  assert.deepEqual(visited, [], "Turbo.visit must not fire when a turbo-frame is present")
  assert.equal(controller._pendingRedirectUrl, "/should-not-visit", "URL is stashed for the frame-missing path")
})
