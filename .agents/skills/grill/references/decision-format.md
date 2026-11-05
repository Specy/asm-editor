# Decision format

Decisions are ADRs in `docs/adr/`, numbered in sequence: `0076-a-project-holds-64-mib-of-files.md`,
`0077-agents-read-markdown-twins-derived-from-the-pages-sources.md`, and so on. Scan the directory for
the highest existing number and increment it. Read a few recent ones first and match their style.

An ADR here records a past decision that needs care, not a rule that cannot change: when the
requirements move, propose amending it or writing a new one that supersedes it.

## Template

```md
---
status: proposed
date: YYYY-MM-DD
---

# {Short title of the decision}

{One to three sentences: the context, what was decided, and why.}
```

Set `status` to `accepted` once the user confirms the decision.

That is the whole requirement. A decision can be a single paragraph. The value lies in capturing
_that_ a decision was made and _why_, not in filling out sections.

## Optional sections

Add these only when they earn their place. Most decisions need none of them.

- **Status** values beyond `proposed` and `accepted`: `deprecated`, or `superseded by NNNN` when a
  later ADR replaces it.
- **Considered options**, when the rejected alternatives are worth remembering.
- **Consequences**, when non-obvious downstream effects need calling out.

## What qualifies

A decision earns writing down when it is hard to reverse, surprising without context, and the result of
a real trade-off. In practice that tends to mean:

- **Architectural shape.** "We use a monorepo." "The write model is event-sourced; the read model is
  projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events,
  not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment
  target. Not every library — the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; others
  reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We use hand-written SQL rather than an ORM
  because X." Anything a reasonable reader would assume the opposite of. These stop the next
  engineer from "fixing" something that was intentional.
- **Constraints invisible in the code.** "Compliance rules us out of AWS." "Responses must stay
  under 200ms because of the partner API contract."
- **Rejected alternatives whose rejection is non-obvious.** If GraphQL was considered and REST won
  for subtle reasons, record it, or someone will propose GraphQL again in six months.
