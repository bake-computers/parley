package scrape

// nuxt.go — Lazy resolver over the __NUXT_DATA__ payload.
//
// Nuxt serialises reactive state as a flat JSON array where nested values are
// referenced by index: a number 42 inside the payload means "look at
// payload[42]". Wrapper tuples like ["Reactive", 42] mean the same thing.

// nuxtWrapperTags are tags that wrap an index reference inside the Nuxt payload.
// e.g. ["Reactive", 42] means "resolve index 42".
var nuxtWrapperTags = map[string]bool{
	"Reactive":        true,
	"ShallowReactive": true,
	"Ref":             true,
	"EmptyRef":        true,
	"Set":             true,
	"Map":             true,
}

// maxHops is the safety cap on pointer-chase depth. Real payloads use at most
// 2-3 hops per field; 64 leaves plenty of headroom while bounding worst-case cycles.
const maxHops = 64

// NuxtResolver resolves index references in a Nuxt __NUXT_DATA__ flat array.
type NuxtResolver struct {
	payload []any
}

// NewNuxtResolver creates a resolver over the top-level payload array.
func NewNuxtResolver(payload []any) *NuxtResolver {
	return &NuxtResolver{payload: payload}
}

// Payload returns the backing payload slice.
func (r *NuxtResolver) Payload() []any {
	return r.payload
}

// asInt attempts to interpret an any value as an integer index.
// Returns (index, true) if the value is a whole number float64.
func (r *NuxtResolver) asInt(v any) (int, bool) {
	f, ok := v.(float64)
	if !ok {
		return 0, false
	}
	i := int(f)
	if float64(i) != f {
		return 0, false
	}
	return i, true
}

// Resolve follows pointers/wrappers until we land on a concrete value.
//
// Returns the input unchanged for anything that isn't an index pointer or a
// wrapper tuple. Negative values stay unresolved so callers can distinguish
// -1 sentinels.
//
// Integer dereference semantics: after one integer dereference, the result IS
// the actual value — not another index reference. Following small integers
// further would read unrelated entries from the dedup table.
func (r *NuxtResolver) Resolve(val any) any {
	plainIntConsumed := false
	for range maxHops {
		// Scalar index reference: a plain integer means "resolve payload[i]".
		if idx, ok := r.asInt(val); ok {
			if idx < 0 {
				return val
			}
			if idx >= len(r.payload) {
				return val
			}
			// After one integer dereference, a plain integer IS the actual value.
			if plainIntConsumed {
				return val
			}
			plainIntConsumed = true
			val = r.payload[idx]
			continue
		}

		// Wrapper tuple: ["Reactive", 42] and friends.
		if arr, ok := val.([]any); ok && len(arr) == 2 {
			if tag, ok := arr[0].(string); ok && nuxtWrapperTags[tag] {
				val = arr[1]
				plainIntConsumed = false
				continue
			}
		}

		return val
	}
	return val
}

// ResolveIndex resolves the entry at payload[i]. Returns nil if out of bounds.
func (r *NuxtResolver) ResolveIndex(i int) any {
	if i < 0 || i >= len(r.payload) {
		return nil
	}
	return r.Resolve(r.payload[i])
}

// Field performs object field access that auto-follows pointers on both the
// container (in case value is itself a pointer) and the returned field.
func (r *NuxtResolver) Field(value any, key string) any {
	resolved := r.Resolve(value)
	obj, ok := resolved.(map[string]any)
	if !ok {
		return nil
	}
	raw, ok := obj[key]
	if !ok {
		return nil
	}
	return r.Resolve(raw)
}

// IsNullSentinel checks for Nuxt's {"__i": ...} null sentinel.
func IsNullSentinel(value any) bool {
	obj, ok := value.(map[string]any)
	if !ok {
		return false
	}
	_, has := obj["__i"]
	return len(obj) == 1 && has
}

// IsObject checks if the value is a map[string]any.
func IsObject(v any) bool {
	_, ok := v.(map[string]any)
	return ok
}

// AsObject returns the value as map[string]any, or nil.
func AsObject(v any) map[string]any {
	obj, _ := v.(map[string]any)
	return obj
}

// AsArray returns the value as []any, or nil.
func AsArray(v any) []any {
	arr, _ := v.([]any)
	return arr
}

// AsStr returns the value as a string, or empty string.
func AsStr(v any) string {
	s, _ := v.(string)
	return s
}

// AsFloat returns the value as float64, or 0.
func AsFloat(v any) float64 {
	f, _ := v.(float64)
	return f
}
