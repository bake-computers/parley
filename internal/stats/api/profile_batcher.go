package api

import (
	"context"
	"strings"
	"sync"
	"time"
)

// ProfileBatcher coalesces concurrent full-profile lookups into
// POST /v2/profiles/batch requests.
type ProfileBatcher struct {
	client  *Client
	maxSize int
	delay   time.Duration

	mu      sync.Mutex
	pending map[string]*profileBatchEntry
	timer   *time.Timer
}

type profileBatchEntry struct {
	profileID string
	waiters   []chan profileBatchResult
}

type profileBatchResult struct {
	profile *Profile
	err     error
}

// NewProfileBatcher creates a profile batcher capped at the stats.cc batch API
// limit of 10 profile IDs.
func NewProfileBatcher(client *Client, maxSize int, delay time.Duration) *ProfileBatcher {
	if maxSize <= 0 {
		maxSize = 10
	}
	if maxSize > 10 {
		maxSize = 10
	}
	if delay <= 0 {
		delay = defaultProfileBatchDelay
	}
	return &ProfileBatcher{
		client:  client,
		maxSize: maxSize,
		delay:   delay,
		pending: make(map[string]*profileBatchEntry),
	}
}

// Get enqueues a profile ID and waits for the shared batch result.
func (b *ProfileBatcher) Get(ctx context.Context, profileID string) (*Profile, error) {
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		return nil, &Error{Kind: ErrProfileNotFound, Message: "empty profile id"}
	}

	ch := make(chan profileBatchResult, 1)
	shouldFlush := false

	b.mu.Lock()
	entry, ok := b.pending[profileID]
	if !ok {
		entry = &profileBatchEntry{profileID: profileID}
		b.pending[profileID] = entry
	}
	entry.waiters = append(entry.waiters, ch)

	if len(b.pending) == 1 && b.timer == nil {
		b.timer = time.AfterFunc(b.delay, b.flush)
	}
	if len(b.pending) >= b.maxSize {
		if b.timer != nil {
			b.timer.Stop()
			b.timer = nil
		}
		shouldFlush = true
	}
	b.mu.Unlock()

	if shouldFlush {
		b.flush()
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case result := <-ch:
		return result.profile, result.err
	}
}

func (b *ProfileBatcher) flush() {
	b.mu.Lock()
	if len(b.pending) == 0 {
		b.timer = nil
		b.mu.Unlock()
		return
	}

	entries := make([]*profileBatchEntry, 0, len(b.pending))
	profileIDs := make([]string, 0, len(b.pending))
	for _, entry := range b.pending {
		entries = append(entries, entry)
		profileIDs = append(profileIDs, entry.profileID)
	}
	b.pending = make(map[string]*profileBatchEntry)
	b.timer = nil
	b.mu.Unlock()

	profiles, err := b.client.BatchProfiles(context.Background(), profileIDs)
	if err != nil {
		for _, entry := range entries {
			entry.send(profileBatchResult{err: err})
		}
		return
	}

	byID := make(map[string]*Profile, len(profiles))
	for i := range profiles {
		byID[profiles[i].ID] = &profiles[i]
	}

	for _, entry := range entries {
		profile, ok := byID[entry.profileID]
		if !ok {
			entry.send(profileBatchResult{
				err: &Error{Kind: ErrProfileNotFound, Message: "profile omitted from batch response"},
			})
			continue
		}
		entry.send(profileBatchResult{profile: profile})
	}
}

func (e *profileBatchEntry) send(result profileBatchResult) {
	for _, waiter := range e.waiters {
		waiter <- result
	}
}
