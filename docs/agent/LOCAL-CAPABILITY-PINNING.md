# Direct local capability input pinning

requireLocalCapabilities independently snapshots model/messages/tools/output limit before validating images and awaiting local weight/capability checks. Not every caller uses verifiedLocalProvider; the direct wrapper must not validate an image/model then stream caller-mutated data after await. Original AbortSignal retained, not cloned/replaced.

Tests pause first local show then mutate model/content/image/base64/tool/limit and assert original validated fields reach chat. Abort plus caller signal replacement produces chat0. Existing vision explicit context, image bounds/local weight/tool-capability/lint/offered-tool gates unchanged. Synthetic fetch proof only, no actual model quality claim. No deps/cloud/provider fallback/UI change or visual claim.
