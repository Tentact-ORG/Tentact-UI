# Credits

Workspaces spend credits to see contact details. Search results show every
other field in full; emails and phone numbers are masked (`ma•••@company.com`,
`••• 1234`) until the workspace reveals them.

## What costs credits

| Action | Cost |
| :--- | :--- |
| Reveal a contact's email and phone (the **Reveal** button, or saving/exporting a selection that contains masked contacts) | `CREDITS_PER_CONTACT` (default 1) per contact |
| Export the full results of a search, when the export contains contact details | the same, per contact in the file |
| Reveal or export a contact the workspace has already paid for | free |

A contact is charged once per workspace (`revealed_contacts` has a unique
`(org_id, contact_id)` index). Charging and recording happen in one
transaction; the balance changes through a conditional update, so concurrent
reveals can never take a workspace below zero. With too few credits the
request fails with `402` (`{detail, required, balance}`) and nothing is charged.

Unmasked values never reach the browser before they are paid for: the server
keeps each search page's contact details for an hour under an unguessable
`result_id`, and `POST /api/contacts/reveal` returns only contacts that were
in that result. After an hour the user re-runs the search.

## Topping up

There is no payment provider yet. Members request a top-up on **Credits**
(`POST /api/credits/requests`, at most 5 pending per workspace); sales sends an
invoice. Once it is paid, an operator approves the request:

- **In the app:** users whose email is in `CREDITS_OPERATOR_EMAILS` see a
  *Pending top-ups* queue on the Credits page with Approve/Decline. A request
  is claimed before credits are added, so it can only be approved once.
- **From the command line:** `npm run grant-credits -- --org-slug <slug> --credits 5000 --note "Invoice 1042"`.
- **API:** `POST /api/credits/grant` (operators only).

Every grant, charge and decision is a ledger row (`credit_ledger`) and an audit event.

## Endpoints

| Endpoint | Who | Purpose |
| :--- | :--- | :--- |
| `GET /api/credits` | members | Balance, last 50 ledger entries, the workspace's requests, `is_operator` |
| `POST /api/contacts/reveal` | members | `{result_id, contact_ids}` → unmasked details, credits charged, new balance |
| `POST /api/credits/requests` | members | Request a top-up `{credits, pack?, note?}` |
| `GET /api/credits/requests` | operators | Pending requests from every workspace |
| `PATCH /api/credits/requests/{id}` | operators | `{status: "APPROVED" \| "DECLINED"}` |
| `POST /api/credits/grant` | operators | `{org_id, credits, note?}` |

Set `CREDITS_ENABLED=false` to show contact details in full and charge nothing.
