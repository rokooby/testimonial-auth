# Testimonial Authentication

GenLayer smart contract for verifying testimonial authenticity using AI analysis.

- **Contract**: `backend/testimonial-auth.py`
- **App**: https://rokooby.github.io/testimonial-auth/

## Features

- AI-powered testimonial verification
- Fake testimonial detection on blockchain
- Immutable testimonial records
- Authenticity scoring
- Enforced 24-hour on-chain challenge period before an unchallenged vouch can
  be confirmed or its bond reclaimed

## Vouch settlement

Every new vouch stores a `challenge_deadline` equal to the deterministic
GenLayer transaction time plus 24 hours. While that deadline is active:

- anyone except the author may challenge the open vouch by posting a stake;
- `confirm_unchallenged` reverts, including when called by the author or owner;
- reputation is unchanged and the author's bond remains locked.

At the deadline, new challenges close and an unchallenged vouch becomes
confirmable. Open vouches created before this upgrade must first call
`start_challenge_period`, which starts a fresh full 24-hour window.

## Tech Stack

- **Backend**: GenLayer (Python)
- **Frontend**: React + TypeScript + Vite
- **Blockchain**: GenLayer Network
