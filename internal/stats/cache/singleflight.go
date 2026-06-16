package cache

import (
	"fmt"

	"golang.org/x/sync/singleflight"
)

// SingleFlight coalesces concurrent calls for the same key so the
// underlying function runs exactly once. Unlike golang.org/x/sync/singleflight
// which returns shared results as interface{}, this is a generic wrapper
// that preserves type safety.
//
// Mirrors the Rust SingleFlight<K, V> in cache_store.rs but uses the
// standard library's singleflight under the hood (which uses channels
// internally, matching the Rust watch-channel approach).
type SingleFlight[K comparable, V any] struct {
	group singleflight.Group
}

// NewSingleFlight creates a new typed singleflight group.
func NewSingleFlight[K comparable, V any]() *SingleFlight[K, V] {
	return &SingleFlight[K, V]{}
}

// Do calls fn exactly once for concurrent calls with the same key.
// All callers receive the same result.
func (sf *SingleFlight[K, V]) Do(key K, fn func() V) V {
	result, _, _ := sf.DoErr(key, func() (V, error) {
		return fn(), nil
	})
	return result
}

// DoErr is like Do but supports an error return from fn.
// On error, all waiting callers receive the same error.
func (sf *SingleFlight[K, V]) DoErr(key K, fn func() (V, error)) (V, error, bool) {
	val, err, shared := sf.group.Do(fmtKey(key), func() (any, error) {
		v, err := fn()
		return v, err
	})
	if err != nil {
		var zero V
		return zero, err, shared
	}
	return val.(V), nil, shared
}

func fmtKey[K comparable](k K) string {
	if s, ok := any(k).(string); ok {
		return s
	}
	return fmt.Sprintf("%v", k)
}
