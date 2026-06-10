# Architectural Proposal: SyncService Conflict Resolution & Last-Write-Wins (LWW)

## 1. Problem Statement
The current `SyncService` architecture suffers from a permanent conflict deadlock when offline edits occur. 
Currently, `pushChangesToSupabase` manually checks `findConflictingRemoteIds` and rejects local updates if the remote Supabase record is newer. However, `WatermelonDB`'s `synchronize()` lacks an explicit `conflictResolver` parameter in this app's implementation. Consequently, WatermelonDB defaults to ignoring remote updates if the local record is marked as `updated`. 

This mismatch means that if a record is modified both offline and on the server, the client will never push its changes (due to `findConflictingRemoteIds` blocking it) and will never pull the server's changes (due to WatermelonDB's default behavior). The record becomes permanently stuck in `pendingChanges`.

## 2. Proposed Architecture

### Implement Explicit `conflictResolver` in `synchronize()`
We must adopt a true Last-Write-Wins (LWW) strategy using an explicit `conflictResolver` function injected into WatermelonDB's `synchronize()` call.

```typescript
import { synchronize } from '@nozbe/watermelondb/sync';

await synchronize({
  database,
  pullChanges: async ({ lastPulledAt }) => { /* ... */ },
  pushChanges: async ({ changes }) => { /* ... */ },
  
  // New Component: Conflict Resolver
  conflictResolver: (tableName, localRecord, remoteRecord) => {
    // Both records must have a timestamp (e.g., updated_at)
    const localTime = localRecord.updated_at || 0;
    const remoteTime = remoteRecord.updated_at || 0;
    
    if (remoteTime > localTime) {
      // Server wins
      return remoteRecord;
    }
    // Client wins
    return localRecord;
  }
});
```

### Remove Manual Rejection in `pushChangesToSupabase`
With the `conflictResolver` correctly discarding outdated local changes during the pull phase, we can safely remove the `findConflictingRemoteIds` blocking logic from the push phase. This ensures that any changes remaining in the local queue are inherently the most recent and should be aggressively pushed via `db.batch()` or chunked upserts.

## 3. Migration Plan
1. **Schema Update**: Ensure all WatermelonDB models and Supabase tables maintain an accurate `updated_at` timestamp.
2. **Refactor Pull Logic**: Pass the `conflictResolver` into `synchronize()`.
3. **Refactor Push Logic**: Strip the obsolete `findConflictingRemoteIds` check to streamline upserts.
4. **Validation**: Test offline collision scenarios using Jest to guarantee that the `pendingChanges` queue successfully clears.
