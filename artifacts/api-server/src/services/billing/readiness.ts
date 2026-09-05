/** Shared runtime gate: no Stripe Checkout may start until webhook safety is configured. */
let stripeBillingReady = false;

export function isStripeBillingReady() {
  return stripeBillingReady;
}

export function setStripeBillingReady(ready: boolean) {
  stripeBillingReady = ready;
}