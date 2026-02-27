# Investment Screener Example

Masdar-style investment screening using Mizan SDK rule engine.

## Rules
- Sanctioned entities → REJECTED
- UAE large investments (≥1M AED) → APPROVED
- Green energy investments → Fast-tracked APPROVED
- Small investments (<100K) → REJECTED
- Foreign large investments → REVIEW

## Run
```bash
node index.js
```
