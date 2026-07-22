import { UltimateTurboModalController } from "ultimate_turbo_modal"

export default class extends UltimateTurboModalController {
  connect() {
    super.connect()

    this.frameless = !this.turboFrame
    if (this.frameless) this.turboFrame = this.element
  }

  submitEnd(event) {
    const response = event.detail.fetchResponse?.response

    if (this.frameless && event.detail.success && response?.redirected) {
      this.hideModalWithPromise({ skipHistoryBack: true }).then(() => {
        window.Turbo.visit(response.url)
      })
      return
    }

    super.submitEnd(event)
  }
}
