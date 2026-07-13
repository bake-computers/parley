package fetch

import "strings"

func normalizeDisplayName(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

func platformSearchOrder(p StatsPlatform) []StatsPlatform {
	if p == StatsPlatformAuto {
		return []StatsPlatform{StatsPlatformPC, StatsPlatformXbox, StatsPlatformPlaystation}
	}
	return []StatsPlatform{p}
}
