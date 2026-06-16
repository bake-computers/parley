package logging

import "strings"

// ResolveIngestURL builds the Axiom ingest endpoint (mirrors packages/axiom resolveAxiomIngestUrl).
func ResolveIngestURL(dataset, edge, edgeURL string) string {
	edgeURL = strings.TrimSpace(edgeURL)
	if edgeURL != "" {
		return strings.TrimRight(edgeURL, "/") + "/v1/ingest/" + dataset
	}
	edge = strings.TrimSpace(edge)
	if edge != "" {
		base := edge
		if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
			base = "https://" + base
		}
		return strings.TrimRight(base, "/") + "/v1/ingest/" + dataset
	}
	return "https://api.axiom.co/v1/datasets/" + dataset + "/ingest"
}
