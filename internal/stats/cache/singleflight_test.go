package cache

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSingleFlight_CoalescesConcurrentWork(t *testing.T) {
	sf := NewSingleFlight[string, int]()
	var counter atomic.Int64

	var wg sync.WaitGroup
	results := make([]int, 50)
	for i := range 50 {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = sf.Do("k", func() int {
				time.Sleep(25 * time.Millisecond)
				counter.Add(1)
				return 42
			})
		}(i)
	}
	wg.Wait()

	for i, r := range results {
		if r != 42 {
			t.Errorf("results[%d] = %d, want 42", i, r)
		}
	}
	if got := counter.Load(); got != 1 {
		t.Errorf("closure ran %d times, want 1", got)
	}
}

func TestSingleFlight_DifferentKeysRunIndependently(t *testing.T) {
	sf := NewSingleFlight[string, int]()
	var counter atomic.Int64

	a := sf.Do("a", func() int {
		counter.Add(1)
		return 1
	})
	b := sf.Do("b", func() int {
		counter.Add(1)
		return 2
	})

	if a != 1 || b != 2 {
		t.Errorf("a=%d, b=%d, want 1, 2", a, b)
	}
	if got := counter.Load(); got != 2 {
		t.Errorf("closure ran %d times, want 2", got)
	}
}

func TestSingleFlight_LeaderErrorPropagates(t *testing.T) {
	sf := NewSingleFlight[string, int]()

	var wg sync.WaitGroup
	errs := make([]error, 10)
	for i := range 10 {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, errs[idx], _ = sf.DoErr("k", func() (int, error) {
				return 0, assertErr("backend down")
			})
		}(i)
	}
	wg.Wait()

	for i, err := range errs {
		if err == nil || err.Error() != "backend down" {
			t.Errorf("errs[%d] = %v, want 'backend down'", i, err)
		}
	}
}

func TestSingleFlight_ConcurrentDifferentKeys(t *testing.T) {
	sf := NewSingleFlight[string, int]()
	var counter atomic.Int64

	var wg sync.WaitGroup
	for i := range 10 {
		wg.Add(1)
		key := fmt.Sprintf("key-%d", i)
		go func() {
			defer wg.Done()
			sf.Do(key, func() int {
				counter.Add(1)
				return 1
			})
		}()
	}
	wg.Wait()

	if got := counter.Load(); got != 10 {
		t.Errorf("closure ran %d times, want 10 (10 distinct keys)", got)
	}
}

type assertErr string

func (e assertErr) Error() string { return string(e) }
