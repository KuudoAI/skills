# Deliverable shape

What a repricing engagement hands back. The output is a decision document plus
a change-set, not an essay about pricing theory.

Adapt to what the user asked for. If they wanted a single SKU checked, most of
this collapses to a paragraph and a number.

## Structure

```
# Repricing strategy — <seller / catalog scope> — <date>

## What the data shows
Catalog size, how many SKUs are competitive vs uncontested, current
featured-offer share where available, and the segments the catalog falls into.
State the pull window and which surfaces the data came from.

## Floors
How the floor was computed, the inputs used, and which inputs were supplied by
the seller versus assumed. Flag every assumption inline.

## Segments and rules
One block per segment: what defines it, how many SKUs, the archetype applied,
and why that archetype rather than another.

## Guardrails
Floor basis, ceiling basis, max change per cycle, cooldown, minimum increment,
and the exclusion list.

## Proposed change-set
The actual price moves, per SKU: current price, proposed price, floor,
distance to floor, and the rule that produced it. This is the part the seller
approves.

## Expected effect and how it will be measured
What should move, over what period, and the metric pair: featured-offer share
alongside contribution per unit.

## Risks and what is not covered
Data that was missing, marketplaces where a surface was unavailable, and
anything the seller must decide.
```

## Rules for the numbers

- Every price carries its floor beside it. A proposed price without its floor
  is not reviewable.
- Distinguish measured from assumed, every time. A margin built on an assumed
  cost of goods is a hypothesis.
- Give contribution alongside any revenue or share figure.
- Show the pull timestamp. Competitive data is perishable and a change-set
  built on yesterday's offers may already be wrong.

## The approval gate

Prices are money, and an automated price change is the fastest way to lose it
at scale. Default to proposing a change-set and having a human approve it
before anything is written.

Before writing, run the proposed changes through the Listings Items validation
preview, which surfaces Featured Offer disqualification and pricing policy
problems without applying the change. Report what it returns. A change-set
that passed validation preview and one that was never checked are different
artifacts, and the seller should know which they are approving.

Skip the gate only when the user has set up a standing arrangement and said so
explicitly. Even then, keep the guardrails hard and report every applied
change.
