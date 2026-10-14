# Privacy gate target and observer hardening

AgentPrivacyGate.run copies provider/endpoint/processing at entry before cloud classification and await. Caller cannot mutate the target during an in-flight operation to make cloud output pass as local on completion. Original consent checks before/after operation and cloud abort tracking remain fail-closed. No new destination/locality assumption; processing local still requires verified metadata, loopback alone does not grant it.

Privacy listeners are isolated: one throwing view cannot stop notifications to other views or make completed revocation/local-only change look failed. Abort/revocation remains first, before notify. Test synthetic storage/operation only, no cloud call. No UI/dependencies/spending, no model/native quality claim.
