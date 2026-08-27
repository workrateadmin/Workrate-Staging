---
name: WorkRate Vapi live assistant prompt edits
description: How to change the live "WorkRate Receptionist" Vapi assistant's behavior (e.g. tone, closing lines) and why that's a different mechanism from publishing WorkRate's own code.
---

The assistant's system prompt/config lives entirely on Vapi's side, not in this repo — no code in `artifacts/api-server` calls the Vapi API to read/update assistants. Changing assistant behavior (e.g. how it ends a call) means fetching and PATCHing the live assistant directly via the Vapi REST API (`GET`/`PATCH /assistant/{id}`) using `VAPI_PRIVATE_KEY`, not editing and publishing WorkRate code.

**Why:** a PATCH to `api.vapi.ai/assistant/{id}` takes effect immediately on the next real call — there is no staging/publish gate like WorkRate's own deploy flow. Always get explicit user confirmation before applying, and call it out as a distinct, immediate change separate from any WorkRate code-publish decision.

**How to apply:** the tenant's assistant ID is not the phone number or a hardcoded constant — look it up from the `integrations` table (`provider = 'vapi'`, `config->>'assistantId'`) in the **production** database, since dev/prod integration rows are separate. When editing the prompt, insert a small targeted block into the existing text (e.g. after the existing "At the end of the call" section) rather than rewriting the whole prompt, to minimize risk of regressing unrelated behavior (multi-tenant guard rails, existing enquiry-collection rules, etc.). Verify the applied change by re-fetching the assistant and checking the returned config for the new block plus that all other fields (voice, firstMessage, server webhook URL, tool IDs) were left untouched.
