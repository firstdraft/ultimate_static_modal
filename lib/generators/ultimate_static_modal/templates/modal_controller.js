// Forked from ultimate_turbo_modal's modal_controller.js.
//
// The only substantive change is that event dispatch now falls back to
// `this.element` when no ancestor <turbo-frame> is present, so the controller
// works for dialogs that are not rendered inside a Turbo Frame (e.g., static
// modals cloned from a <template>). Without this fallback, `hideModal`
// throws the first time and the `hidingModal` guard traps subsequent clicks.
//
// The version-mismatch console warning from UTMR is also removed here — our
// fork has its own version that won't match UTMR's, so the warning would
// fire on every open.
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["container", "content"]
  static values = {
    advanceUrl: String,
    allowedClickOutsideSelector: String
  }

  connect() {
    this.#cleanupStaleDialogs();
    this.turboFrame = this.element.closest('turbo-frame');
    this.hidingModal = this.containerTarget.hasAttribute('data-closing');
    this.originalUrl = window.location.href;

    if (this.hidingModal) {
      this.#resumeClosing();
    } else if (!this.containerTarget.open) {
      this.showModal();
    }

    this.popstateHandler = () => {
      if (this.#hasHistoryAdvanced()) {
        this.#resetHistoryAdvanced();
        this.#immediateCleanup();
      }
    };
    window.addEventListener('popstate', this.popstateHandler);

    this.beforeCacheHandler = () => {
      this.containerTarget.remove();
    };
    document.addEventListener('turbo:before-cache', this.beforeCacheHandler);

    window.modal = this;
  }

  disconnect() {
    this.#cancelEnter();
    this.#cancelResumeClosing();
    this.#cancelCloseCleanup();
    window.removeEventListener('popstate', this.popstateHandler);
    document.removeEventListener('turbo:before-cache', this.beforeCacheHandler);
    window.modal = undefined;
  }

  showModal() {
    this.containerTarget.removeAttribute('data-closing');
    this.containerTarget.removeAttribute('data-enter-ready');
    this.containerTarget.removeAttribute('data-entered');
    if (this.containerTarget.open) this.containerTarget.close();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    this.containerTarget.showModal();
    window.scrollTo(scrollX, scrollY);
    this.#queueEnter();

    if (this.advanceUrlValue && !this.#hasHistoryAdvanced()) {
      this.#setHistoryAdvanced();
      history.pushState({}, "", this.advanceUrlValue);
    }
  }

  hideModal({ skipHistoryBack = false } = {}) {
    if (this.hidingModal) return false
    this.hidingModal = true;

    let event = new Event('modal:closing', { cancelable: true });
    this.#eventTarget().dispatchEvent(event);
    if (event.defaultPrevented) {
      this.hidingModal = false;
      return false
    }

    this._skipHistoryBack = skipHistoryBack;
    this.#resetModalElement();
  }

  hideModalWithPromise(options = {}) {
    return new Promise((resolve) => {
      const target = this.#eventTarget();
      const handler = () => {
        target.removeEventListener('modal:closed', handler);
        resolve();
      };
      target.addEventListener('modal:closed', handler);
      if (this.hideModal(options) === false) {
        target.removeEventListener('modal:closed', handler);
        resolve();
      }
    });
  }

  hide() { this.hideModal(); }
  close() { this.hideModal(); }

  refreshPage() {
    window.Turbo.visit(window.location.href, { action: "replace" });
  }

  submitEnd(e) {
    if (e.detail.success) {
      const response = e.detail.fetchResponse?.response;
      if (response?.redirected) {
        // With a <turbo-frame> ancestor, UTMR's turbo:frame-missing handler
        // consumes this URL and performs the smooth redirect. Without one,
        // that handler never fires — close the modal and navigate directly.
        if (!this.turboFrame) {
          this.hideModalWithPromise({ skipHistoryBack: true }).then(() => {
            window.Turbo.visit(response.url);
          });
          return;
        }
        this._pendingRedirectUrl = response.url;
        return;
      }
      this.hideModal();
    }
  }

  cancelEvent(e) {
    e.preventDefault();
    this.hideModal();
  }

  dialogClicked(e) {
    if (!this.hasContentTarget) return;
    if (this.contentTarget.contains(e.target)) return;
    if (this.#isAllowedOutsideClick(e.target)) return;
    this.hideModal();
  }

  #eventTarget() {
    return this.turboFrame ?? this.element;
  }

  #isAllowedOutsideClick(target) {
    if (!this.allowedClickOutsideSelectorValue) return false;
    return target.closest(this.allowedClickOutsideSelectorValue) !== null;
  }

  #resetModalElement() {
    const historyWasAdvanced = this.#hasHistoryAdvanced();
    this.containerTarget.dataset.utmrHistoryAdvanced = String(historyWasAdvanced);
    this.containerTarget.dataset.utmrSkipHistoryBack = String(!!this._skipHistoryBack);
    this.#applyClosingState();
    this.#queueCloseCleanup(historyWasAdvanced);
  }

  #resumeClosing() {
    const historyWasAdvanced = this.containerTarget.dataset.utmrHistoryAdvanced == 'true';
    this._skipHistoryBack = this.containerTarget.dataset.utmrSkipHistoryBack == 'true';

    this.containerTarget.removeAttribute('data-closing');
    this.containerTarget.setAttribute('data-enter-ready', '');
    this.containerTarget.setAttribute('data-entered', '');
    this.#cancelResumeClosing();

    this.closeFrames = [];
    const outerFrame = requestAnimationFrame(() => {
      if (!this.containerTarget.isConnected) return;

      const innerFrame = requestAnimationFrame(() => {
        if (!this.containerTarget.isConnected) return;
        this.#applyClosingState();
        this.closeFrames = null;
        this.#queueCloseCleanup(historyWasAdvanced);
      });
      this.closeFrames?.push(innerFrame);
    });
    this.closeFrames.push(outerFrame);
  }

  #applyClosingState() {
    this.containerTarget.setAttribute('data-closing', '');
    this.containerTarget.setAttribute('data-enter-ready', '');
    this.containerTarget.removeAttribute('data-entered');
    this.#cancelEnter();
  }

  #queueCloseCleanup(historyWasAdvanced) {
    const dialog = this.containerTarget;
    const transitionTarget = this.#isDrawer()
      ? dialog.querySelector('#drawer-panel')
      : dialog.querySelector('#modal-inner');
    const closeTimeoutMs = this.#isDrawer() ? 750 : 300;
    this.#cancelCloseCleanup();

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.#cancelCloseCleanup();
      window.removeEventListener('popstate', this.popstateHandler);
      const target = this.#eventTarget();
      try { dialog.close(); } catch (_) {}
      try { target.removeAttribute("src"); } catch (_) {}
      try { dialog.remove(); } catch (_) {}
      delete dialog.dataset.utmrHistoryAdvanced;
      delete dialog.dataset.utmrSkipHistoryBack;
      this.#resetHistoryAdvanced();
      try { target.dispatchEvent(new Event('modal:closed', { cancelable: false })); } catch (_) {}

      if (historyWasAdvanced && !this._skipHistoryBack) history.back();
    };

    const onTransitionEnd = (e) => {
      if (e.target === transitionTarget) cleanup();
    };

    this.closeTransitionHandler = onTransitionEnd;
    dialog.addEventListener('transitionend', onTransitionEnd);
    this.closeTimeout = setTimeout(cleanup, closeTimeoutMs);
  }

  #immediateCleanup() {
    this.#cancelEnter();
    this.#cancelResumeClosing();
    this.#cancelCloseCleanup();
    const dialog = this.containerTarget;
    const target = this.#eventTarget();
    try { dialog.close(); } catch (_) {}
    try { target.removeAttribute("src"); } catch (_) {}
    try { dialog.remove(); } catch (_) {}
    try { target.dispatchEvent(new Event('modal:closed', { cancelable: false })); } catch (_) {}
  }

  #cleanupStaleDialogs() {
    document.querySelectorAll('dialog#modal-container').forEach(d => {
      if (d !== this.containerTarget) {
        try { d.close(); } catch (_) {}
        d.remove();
      }
    });
  }

  #isDrawer() {
    return this.containerTarget.dataset.drawer !== undefined
  }

  #queueEnter() {
    this.#cancelEnter();

    this.enterFrames = [];
    const outerFrame = requestAnimationFrame(() => {
      if (!this.containerTarget.isConnected || this.containerTarget.hasAttribute('data-closing')) return;
      this.containerTarget.setAttribute('data-enter-ready', '');

      const innerFrame = requestAnimationFrame(() => {
        if (!this.containerTarget.isConnected || this.containerTarget.hasAttribute('data-closing')) return;
        this.containerTarget.setAttribute('data-entered', '');
        this.enterFrames = null;
      });
      this.enterFrames?.push(innerFrame);
    });
    this.enterFrames.push(outerFrame);
  }

  #cancelEnter() {
    if (!this.enterFrames) return;
    this.enterFrames.forEach(id => cancelAnimationFrame(id));
    this.enterFrames = null;
  }

  #cancelResumeClosing() {
    if (!this.closeFrames) return;
    this.closeFrames.forEach(id => cancelAnimationFrame(id));
    this.closeFrames = null;
  }

  #cancelCloseCleanup() {
    clearTimeout(this.closeTimeout);
    this.closeTimeout = null;

    if (!this.closeTransitionHandler) return;
    this.containerTarget.removeEventListener('transitionend', this.closeTransitionHandler);
    this.closeTransitionHandler = null;
  }

  #hasHistoryAdvanced() {
    return document.body.getAttribute("data-turbo-modal-history-advanced") == "true"
  }

  #setHistoryAdvanced() {
    return document.body.setAttribute("data-turbo-modal-history-advanced", "true")
  }

  #resetHistoryAdvanced() {
    document.body.removeAttribute("data-turbo-modal-history-advanced");
  }
}
