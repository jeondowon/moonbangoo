(function (P) {
  'use strict';
  // One captured pointer owns a gesture. A second contact cancels until all lift.
  class ShuffleInput {
    constructor(canvas, callbacks) {
      this.canvas = canvas; this.callbacks = callbacks; this.active = null;
      this.contacts = new Set(); this.blocked = false;
      canvas.addEventListener('pointerdown', event => this.down(event));
      canvas.addEventListener('pointermove', event => this.move(event));
      canvas.addEventListener('pointerup', event => this.up(event));
      canvas.addEventListener('pointercancel', event => this.up(event, true));
      canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === this.active) this.cancel(); });
      canvas.addEventListener('dragstart', event => { if (callbacks.enabled()) event.preventDefault(); });
      window.addEventListener('pointerdown', event => {
        if (event.target !== canvas && (this.active !== null || this.blocked)) {
          this.contacts.add(event.pointerId); this.blocked = true; this.cancel();
        }
      });
      window.addEventListener('pointerup', event => this.up(event));
      window.addEventListener('pointercancel', event => this.up(event, true));
      window.addEventListener('blur', () => this.cancel(true));
      window.addEventListener('resize', () => this.cancel(true));
      window.addEventListener('orientationchange', () => this.cancel(true));
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(true); });
    }
    point(event) {
      const area = this.callbacks.area();
      return { x: (event.clientX - area.x) / area.s, y: (event.clientY - area.y) / area.s, time: event.timeStamp };
    }
    down(event) {
      if (!this.callbacks.enabled() || event.button > 0) return;
      event.preventDefault(); this.contacts.add(event.pointerId);
      if (this.active !== null || this.contacts.size > 1 || event.isPrimary === false) {
        this.blocked = true; this.cancel(); return;
      }
      if (this.blocked) return;
      this.active = event.pointerId;
      try { this.canvas.setPointerCapture(event.pointerId); } catch (_) { this.cancel(); return; }
      this.callbacks.begin(this.point(event));
    }
    move(event) {
      if (event.pointerId !== this.active || !this.callbacks.enabled()) return;
      event.preventDefault();
      const samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
      for (const sample of samples.length ? samples : [event]) this.callbacks.move(this.point(sample));
    }
    up(event, canceled) {
      this.contacts.delete(event.pointerId);
      if (event.pointerId === this.active) {
        event.preventDefault();
        const id = this.active; this.active = null;
        if (canceled || !this.callbacks.enabled()) this.callbacks.cancel();
        else this.callbacks.release(this.point(event));
        try { this.canvas.releasePointerCapture(id); } catch (_) {}
      }
      if (!this.contacts.size) this.blocked = false;
    }
    cancel(clearContacts) {
      const id = this.active; this.active = null;
      if (id !== null) { this.callbacks.cancel(); try { this.canvas.releasePointerCapture(id); } catch (_) {} }
      if (clearContacts) { this.contacts.clear(); this.blocked = false; }
    }
  }
  P.ShuffleInput = ShuffleInput;
})(window.CosmicPinball = window.CosmicPinball || {});
