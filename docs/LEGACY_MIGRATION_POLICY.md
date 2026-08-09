# Legacy Data Migration Policy

## Overview
This document defines the rules and abstractions for handling legacy data (records lacking `tenantId` and/or `storeId`) in a strictly multi-tenant architecture. 

## The Absolute Zero-Write Rule (Phase 3)
At this stage of development (PH-003), any legacy data migration must operate under a strict **ZERO-WRITE POLICY**. Migration functionality is restricted to **Dry Run Only**.
- Legacy data can be analyzed and classified.
- The underlying Google Sheets (or any future provider) MUST NOT be modified.
- Data seeding or automatic fixes are strictly forbidden upon application boot or query.

## Record Classification
Legacy records are analyzed and classified into one of the following states:
1. `FULLY_ASSIGNED`: The record possesses a valid `tenantId` and `storeId`.
2. `TENANT_MISSING`: The record lacks a `tenantId`.
3. `STORE_MISSING`: The record possesses a `tenantId` but lacks a `storeId`.
4. `BOTH_MISSING`: The record lacks both `tenantId` and `storeId`.
5. `INVALID_SCOPE`: The record possesses both IDs, but they conflict with the expected scope (for explicit migration targeting).

## Migration Eligibility
- By default, unassigned legacy records have `UNKNOWN OWNERSHIP`. They are **BLOCKED** from migration because the system cannot and MUST NOT guess ownership.
- AI models, algorithms, and implicit context fallback mechanisms are strictly forbidden from assigning `tenantId` or `storeId` to a legacy record.
- A record becomes **ELIGIBLE** for migration *only* when an explicit, trusted source of ownership (e.g., an explicit administrative migration command providing the exact `tenantId` and `storeId`) is provided to the analyzer.
- Until an explicit execute command is designed and authorized in a future phase, all operations remain strictly analytical (Dry Run).
