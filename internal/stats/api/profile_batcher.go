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

	mu       sync.Mutex
	pending  map[string]*profileBatchEntry
	inFlight map[string]*profileBatchEntry
	timer    *time.Timer
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
		client:   client,
		maxSize:  maxSize,
		delay:    delay,
		pending:  make(map[string]*profileBatchEntry),
		inFlight: make(map[string]*profileBatchEntry),
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
		entry, ok = b.inFlight[profileID]
	}
	if !ok {
		entry = &profileBatchEntry{profileID: profileID}
		b.pending[profileID] = entry
		if len(b.pending) == 1 && b.timer == nil {
			b.timer = time.AfterFunc(b.delay, b.flush)
		}
	}
	entry.waiters = append(entry.waiters, ch)

	if _, stillPending := b.pending[profileID]; stillPending && len(b.pending) >= b.maxSize {
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
		b.dropWaiter(profileID, ch)
		return nil, ctx.Err()
	case result := <-ch:
		return result.profile, result.err
	}
}

// dropWaiter removes a cancelled waiter from pending (if still queued). No-op if
// the entry already flushed into inFlight.
func (b *ProfileBatcher) dropWaiter(profileID string, ch chan profileBatchResult) {
	b.mu.Lock()
	defer b.mu.Unlock()

	entry, ok := b.pending[profileID]
	if !ok {
		return
	}
	for i, w := range entry.waiters {
		if w == ch {
			entry.waiters = append(entry.waiters[:i], entry.waiters[i+1:]...)
			break
		}
	}
	if len(entry.waiters) == 0 {
		delete(b.pending, profileID)
	}
	if len(b.pending) == 0 && b.timer != nil {
		b.timer.Stop()
		b.timer = nil
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
	for id, entry := range b.pending {
		entries = append(entries, entry)
		profileIDs = append(profileIDs, entry.profileID)
		b.inFlight[id] = entry
	}
	b.pending = make(map[string]*profileBatchEntry)
	b.timer = nil
	b.mu.Unlock()

	// The batch is shared across independent waiters that may cancel their own
	// contexts at any time, so we can't adopt any single caller's context. Bound
	// the outbound request with a timeout consistent with the client's default
	// HTTP timeout so a stalled batch can't run unbounded after every waiter has
	// already returned with ctx.Err().
	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	profiles, err := b.client.BatchProfiles(ctx, profileIDs)
	if err != nil {
		for _, entry := range entries {
			b.resolveDirect(ctx, entry)
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
			b.resolveDirect(ctx, entry)
			continue
		}
		b.deliver(entry, profileBatchResult{profile: profile})
	}
}

func (b *ProfileBatcher) resolveDirect(ctx context.Context, entry *profileBatchEntry) {
	profile, err := b.client.getProfileDirect(ctx, entry.profileID)
	b.deliver(entry, profileBatchResult{profile: profile, err: err})
}

// deliver snapshots waiters under the lock, clears inFlight, then sends. Late
// Get callers that miss inFlight start a new pending entry instead of hanging.
func (b *ProfileBatcher) deliver(entry *profileBatchEntry, result profileBatchResult) {
	b.mu.Lock()
	waiters := entry.waiters
	entry.waiters = nil
	delete(b.inFlight, entry.profileID)
	b.mu.Unlock()

	for _, waiter := range waiters {
		out := result
		if result.profile != nil {
			cp := *result.profile
			out.profile = &cp
		}
		waiter <- out
	}
}
