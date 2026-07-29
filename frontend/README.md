# Vouch

Optimistic testimonial attestation on GenLayer. An author posts a vouch about a subject and backs it with a GEN bond. The vouch is treated as genuine unless someone stakes GEN to challenge it. On a challenge a panel of GenLayer validators reads the relationship text plus on-chain graph signals (author out-degree, prior fabrications, subject in-degree) and agrees on a single REAL or FAKE verdict, then a second pass classifies the relationship type and independence. The loser is slashed to the winner, the subject keeps a trust score that moves with confirmed-genuine and fabricated outcomes, and an unchallenged vouch can be confirmed and the bond reclaimed.

## Contract

- Network: GenLayer Studionet (chain id 61999)
- Address: `0xb7121684f57cC2efDB3B6E30291144A6532CA72A5`

## Methods

post_vouch (payable), challenge (payable), adjudicate, classify_relationship, settle, confirm_unchallenged, reclaim_bond, plus get_vouch, get_subject, get_subject_vouches, get_author_degree, get_counts.

## Run

```bash
npm install
npm run dev
npm run build
```
