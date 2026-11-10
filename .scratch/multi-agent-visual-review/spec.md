# Independent multi-agent visual proxy review
Status: Done (AI proxy study; human product acceptance remains separate)
Source: User authorized two independent visual reviewers and a third adjudicator

Read-only camera batch, all1233 JPEG analysis sources. Reviewers see numbered
contact sheets and no machine ranking, former labels, scores or each other's
decisions. Pilot120 frames before extending the same protocol. Reviewer A/B
write separate append-only local JSONL with one visual observation per frame.
Third agent sees disputes and image context, never machine recommendations.

Combine conservatively: any remaining uncertain keep/exclude conflict stays
protected. Retain both raw ballots, adjudication, rationale, SHA identity and
AI provenance. Freeze the combined labels before evaluating beta.3. Separate
moment-boundary disagreements from frame preference. Never rewrite the prior
proxy report or count agents as humans. No inference-triggered exports, original
writes, cloud vision service, architecture change or production deployment.

Private sheets, photo paths and ballots remain ignored under output/. Publish
only reusable tooling and aggregate results. Hash full source inventory before
and after; remove temporary browser and disposable derived sheets after review.

Completed: A/B1233 each,326 adjudications; merged301keep/763optional/169protected.
Full2466-source integrity passed. Labels frozen before beta2/3 comparison; keep
union stress and historical-proxy disagreements are reported explicitly. Local
126Node/syntax/build passed; production artifact6SHA unchanged. PR tracks CI.
