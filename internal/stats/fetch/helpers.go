package fetch

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"sync"
)

var uuidRegex = sync.OnceValue(func() *regexp.Regexp {
	return regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)
})

func isRetryableStatus(status int) bool {
	return status == 429 || status >= 500
}

func normalizeDisplayName(v string) string {
	return strings.ToLower(strings.TrimSpace(v))
}

// resolvedProfileTarget holds the result of resolving a username to a canonical profile URL.
type resolvedProfileTarget struct {
	username   string
	uuid       string
	platform   StatsPlatform
	profileURL string
}

func parseResolvedProfileURL(rawURL string) (username string, uuid string, ok bool) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", "", false
	}
	parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
	if len(parts) < 3 || parts[0] != "siege" {
		return "", "", false
	}
	decoded, err := url.PathUnescape(parts[1])
	if err != nil {
		return "", "", false
	}
	uuid = strings.ToLower(parts[2])
	if decoded == "" || !uuidRegex().MatchString(uuid) {
		return "", "", false
	}
	return decoded, uuid, true
}

func platformSearchOrder(p StatsPlatform) []StatsPlatform {
	if p == StatsPlatformAuto {
		return []StatsPlatform{StatsPlatformPC, StatsPlatformXbox, StatsPlatformPlaystation}
	}
	return []StatsPlatform{p}
}

// percentDecode decodes percent-encoded strings. Go's net/url handles this,
// but we keep a minimal version for parity with the Rust implementation.
func percentDecode(s string) (string, error) {
	return url.PathUnescape(s)
}

// urlencodingEncode performs minimal percent-encoding matching encodeURIComponent
// for plain ASCII usernames. Only unreserved characters are passed through.
func urlencodingEncode(v string) string {
	var b strings.Builder
	b.Grow(len(v) + len(v)/4)
	for i := 0; i < len(v); i++ {
		c := v[i]
		if isUnreserved(c) {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func isUnreserved(c byte) bool {
	return (c >= 'a' && c <= 'z') ||
		(c >= 'A' && c <= 'Z') ||
		(c >= '0' && c <= '9') ||
		c == '-' || c == '_' || c == '.' || c == '~'
}
