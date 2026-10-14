# Explicit-source local embedding index lifecycle (AS)

AL supplies pure chunks/ranking, not an embedding provider. This slice prepares
pure lifecycle descriptors only, no filesystem discovery, transport, index data,
storage, scheduled watching, API adapter or UI. Nothing is auto-indexed.

Host must capture explicit chosen source IDs and trustworthy content revision
handles, exact installed model tag/digest, embedding dimensions and local endpoint.
No path crawling/history/hidden settings/credentials inferred from those IDs. A
revision handle must change whenever content changes; no timestamps masquerading
as content hashes. The helper compares identifiers, it does not compute hashes or
prove host truth. Inputs are metadata only, never disclosed to a remote provider.

Start build from a frozen descriptor with monotonically increasing generation.
Rebuild invalidates any earlier ready state immediately, even for identical source
facts. Complete only same-generation building work and freshly matching ordered
sources/revisions/model/digest/dimensions/endpoint. Drift invalidates and requires
fresh explicit review/rebuild. Cancel invalidates pending work. Failed/stale results
cannot be called ready. Host must also cancel actual requests and dispose vectors.

Query acceptance separately compares the complete ready descriptor with a fresh
capture immediately before ranking. No stale partial results or mixed model/digest
vectors. No incremental append or automatic rebuild. These checks aren't locks:
host must atomically validate actual content/digest and commit/use vector data.
Pure descriptors carry no vectors or content. Existing AL limits and vector checks
still apply. Future adapter must fresh-verify local weights/embedding capability,
consent/source limits and daemon trust; loopback is not attested zero-egress.

Roadmap-Delta: pure invalidation/session descriptor contract before embed transport
or persisted index. Real extraction/hash/vector store, request cancellation, model
compatibility and privacy/packaged E2E evidence remain open. No dependencies/spend.

Scope limit: descriptor doesn't encode chunker/normalizer/template version or
chunk size, so changing any pipeline setting requires explicit invalidate/rebuild
by the host. The descriptor alone cannot detect those changes. Persistence is out
of scope; a future disk schema must include every vector-producing pipeline version
and atomic content validation. Query safety cannot rely on revision handles that
stay unchanged after edits. Four focused tests cover frozen capture, all current
fingerprint drift axes, cancel/rebuild late result refusal and strict bounds/shape.
