# Billing provider TODO

## Stripe connector verification

Replit's Stripe connector does not expose an existing endpoint secret. WorkRate
therefore creates its endpoint once, encrypts the returned signing secret with
AES-256-GCM using a key derived from `SESSION_SECRET`, and stores only ciphertext
in the public billing provider configuration table. The API verifies
`stripe-signature` over the exact raw body before parsing, then retrieves the
same event through the authenticated connector as defense in depth.

- [x] Stripe account connection
- [x] Product/price mapping
- [x] Hosted Checkout
- [x] Customer portal
- [x] Webhook verification through canonical event retrieval
- [x] Subscription sync
- [x] Payment lifecycle and retry tests