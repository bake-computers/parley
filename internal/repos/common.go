package repos

import "time"

// NowMS returns the current UTC time as epoch milliseconds.
func NowMS() int64 {
	return time.Now().UTC().UnixMilli()
}
