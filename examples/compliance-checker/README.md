# UAE Commercial License Compliance Checker

Validates business entities against UAE commercial licensing rules.

## Rules
- No license → REJECTED
- Expired license → REJECTED  
- Valid license → APPROVED
- Free zone + valid license → APPROVED
- Restricted activity → REVIEW

## Run
```bash
node index.js
```
