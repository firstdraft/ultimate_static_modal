import { Controller } from "@hotwired/stimulus"

// Clones the <template> referenced by data-static-modal-id-value into
// document.body. UTMR's "modal" Stimulus controller takes over once the
// cloned <dialog> is attached and animates the modal/drawer into view.
export default class extends Controller {
  static values = { id: String }

  open() {
    const template = document.getElementById(this.idValue)
    if (!template) {
      console.warn(`[static-modal] No <template> found with id="${this.idValue}"`)
      return
    }
    document.body.appendChild(template.content.cloneNode(true))
  }
}
