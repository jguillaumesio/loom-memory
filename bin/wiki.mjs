#!/usr/bin/env node
// Legacy entrypoint. The packaged binary now points at bin/cli.js, but keep this
// file working for anyone who invokes it directly from an older checkout.
await import('./cli.js');
