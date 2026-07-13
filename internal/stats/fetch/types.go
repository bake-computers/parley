package fetch

// RetryPolicy configures retry behaviour for retryable upstream errors (429, 5xx, network).
type RetryPolicy struct {
	MaxAttempts      int
	InitialBackoffMS int64
	MaxBackoffMS     int64
}

// DefaultRetryPolicy returns the default retry configuration (2 attempts, 200ms initial backoff).
func DefaultRetryPolicy() RetryPolicy {
	return RetryPolicy{
		MaxAttempts:      2,
		InitialBackoffMS: 200,
		MaxBackoffMS:     2000,
	}
}

// NoRetryPolicy disables retries entirely. Used by tests that want deterministic
// single-shot behaviour.
func NoRetryPolicy() RetryPolicy {
	return RetryPolicy{
		MaxAttempts:      1,
		InitialBackoffMS: 0,
		MaxBackoffMS:     0,
	}
}
