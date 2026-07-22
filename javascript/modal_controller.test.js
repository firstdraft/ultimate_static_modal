import { test, before, beforeEach, afterEach } from "node:test"
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
let UltimateTurboModalController

before(async () => {
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
  globalThis.CSS = window.CSS
  globalThis.getComputedStyle = window.getComputedStyle.bind(window)
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  globalThis.history = window.history
  window.scrollTo = () => {}

  const ultimateTurboModalEntry = import.meta.resolve("ultimate_turbo_modal")
  const turbo = { StreamActions: {} }
  globalThis.Turbo = turbo
  window.Turbo = turbo

  const upstream = await import(ultimateTurboModalEntry)
  UltimateTurboModalController = upstream.UltimateTurboModalController

  const src = readFileSync(CONTROLLER_PATH, "utf8")
  const rewritten = src.replace(
    /from\s+["']ultimate_turbo_modal["']/,
    `from "${ultimateTurboModalEntry}"`
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
let turboFrame

beforeEach(() => {
  document.body.innerHTML = ""
  document.body.removeAttribute("data-turbo-modal-history-advanced")
  window.Turbo.visit = () => {}
})

afterEach(async () => {
  document.body.innerHTML = ""
  await new Promise((resolve) => setTimeout(resolve, 0))
  app?.stop()
})

async function mountController({ framed = false } = {}) {
  dialog = document.createElement("dialog")
  dialog.id = "modal-container"
  dialog.className = "utmr"
  dialog.setAttribute("data-controller", "modal")
  dialog.setAttribute("data-modal-target", "container")

  const inner = document.createElement("div")
  inner.id = "modal-inner"
  const content = document.createElement("div")
  content.id = "modal-content"
  content.setAttribute("data-modal-target", "content")
  inner.appendChild(content)
  dialog.appendChild(inner)

  dialog.showModal = () => { dialog.setAttribute("open", "") }
  dialog.close = () => { dialog.removeAttribute("open") }

  if (framed) {
    turboFrame = document.createElement("turbo-frame")
    turboFrame.id = "modal"
    turboFrame.appendChild(dialog)
    document.body.appendChild(turboFrame)
  } else {
    turboFrame = null
    document.body.appendChild(dialog)
  }

  app = Application.start()
  app.register("modal", ModalController)

  await new Promise((r) => setTimeout(r, 0))

  controller = app.getControllerForElementAndIdentifier(dialog, "modal")
  assert.ok(controller, "controller should be connected")
  dialog.setAttribute("data-entered", "")
}

test("frameless dialogs adapt UTMR's current controller instead of copying it", async () => {
  await mountController()

  assert.ok(controller instanceof UltimateTurboModalController)
  assert.equal(controller.frameless, true)
  assert.equal(controller.turboFrame, dialog)
  assert.equal(typeof controller.dialogMousedown, "function")
})

test("hideModal dispatches lifecycle events on a frameless dialog", async () => {
  await mountController()
  let captured = null
  dialog.addEventListener("modal:closing", (event) => {
    captured = event
  })

  assert.doesNotThrow(() => controller.hideModal())
  assert.ok(captured, "modal:closing event was dispatched")
  assert.equal(captured.cancelable, true)
  assert.equal(controller.hidingModal, true)
})

test("redirected submissions from frameless dialogs close before visiting", async () => {
  await mountController()
  const lifecycle = []
  window.Turbo = { visit: (url) => lifecycle.push(`visit:${url}`) }
  dialog.addEventListener("modal:closed", () => lifecycle.push("closed"))

  controller.submitEnd({
    detail: {
      success: true,
      fetchResponse: {
        response: { redirected: true, url: "/after-submit" }
      }
    }
  })

  assert.deepEqual(lifecycle, [], "navigation waits for the close lifecycle")
  assert.equal(dialog.hasAttribute("data-closing"), true)
  assert.equal(controller._skipHistoryBack, true)

  dialog.querySelector("#modal-inner").dispatchEvent(
    new Event("transitionend", { bubbles: true })
  )
  await new Promise((r) => setTimeout(r, 0))

  assert.equal(dialog.isConnected, false)
  assert.deepEqual(lifecycle, ["closed", "visit:/after-submit"])
})

test("framed dialogs preserve UTMR's controller and redirect behavior", async () => {
  await mountController({ framed: true })
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
  assert.ok(controller instanceof UltimateTurboModalController)
  assert.equal(controller.frameless, false)
  assert.equal(controller.turboFrame, turboFrame)
  assert.equal(controller._pendingRedirectUrl, "/should-not-visit", "URL is stashed for the frame-missing path")
})
