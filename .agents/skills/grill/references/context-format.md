# CONTEXT.md format

## Structure

```md
# {Context Name}

{One or two sentences on what this context is and why it exists.}

## Language

**Order**:
A confirmed request from a Customer for goods at an agreed price.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account
```

## Rules

- **Be opinionated.** When several words exist for one concept, pick the best and list the rest
  under `_Avoid_`.
- **Keep definitions tight.** One or two sentences. Define what the term _is_, not what it does.
- **Only include terms specific to this project's context.** General programming concepts —
  timeouts, error types, utility patterns — do not belong, however heavily the project uses them.
  Before adding a term, ask whether it is unique to this context or just general vocabulary. Only
  the former belongs.
- **Group terms under subheadings** when natural clusters emerge. A flat list is fine when the terms
  all belong to one cohesive area.

## Single and multi-context repositories

Most repositories have a single context: one `CONTEXT.md` at the root, with decisions in
`docs/adr/`.

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

When a project has several contexts, a `CONTEXT-MAP.md` at the root lists them, says where each
lives, and records how they relate. Each context keeps its own `CONTEXT.md`, and decisions live
either with their context or, when system-wide, at the root.

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

```md
# Context Map

## Contexts

- [Ordering](./src/ordering/CONTEXT.md) — receives and tracks customer orders
- [Billing](./src/billing/CONTEXT.md) — generates invoices and processes payments
- [Fulfillment](./src/fulfillment/CONTEXT.md) — manages warehouse picking and shipping

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events; Fulfillment consumes them to
  start picking
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events; Billing consumes them
  to generate invoices
- **Ordering ↔ Billing**: Shared types for `CustomerId` and `Money`
```

Infer which structure applies: read `CONTEXT-MAP.md` if it exists, otherwise treat a root
`CONTEXT.md` as the single context, otherwise create a root `CONTEXT.md` when the first term is
resolved. When several contexts exist, work out which one the current topic belongs to, and ask if
it is unclear.
