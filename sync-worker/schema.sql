-- One row per sync code. The service never sees the code itself, only the vault id and a hash of the
-- access key worked out from it, and the encrypted data.
CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY,            -- 32 hex characters, from the sync code
  auth_hash TEXT NOT NULL,        -- SHA-256 of the access key
  rev INTEGER NOT NULL,           -- goes up by one with every upload
  blob TEXT NOT NULL,             -- the encrypted copy (AES-GCM), at most about 1.9 MB
  created_at INTEGER NOT NULL,    -- milliseconds since 1970
  updated_at INTEGER NOT NULL
);
