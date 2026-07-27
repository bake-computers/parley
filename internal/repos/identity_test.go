package repos_test

import (
	"context"
	"testing"
	"time"

	"github.com/bake-computers/parley/internal/config"
	"github.com/bake-computers/parley/internal/db"
	"github.com/bake-computers/parley/internal/models"
	"github.com/bake-computers/parley/internal/repos"
	"github.com/bake-computers/parley/internal/testutil"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func testBunDB(t *testing.T) (*repos.IdentityRepo, func()) {
	t.Helper()
	if !testutil.DockerAvailable() {
		t.Skip("docker not available")
	}
	testutil.PrepareDockerForTestcontainers(t)

	ctx := context.Background()

	pg, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("parley_test"),
		postgres.WithUsername("parley"),
		postgres.WithPassword("parley"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("start postgres: %v", err)
	}

	connStr, err := pg.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		_ = pg.Terminate(ctx)
		t.Fatalf("connection string: %v", err)
	}

	cfg := &config.Config{
		DatabaseURL:   connStr,
		RunMigrations: true,
		DBTLS:         "none",
		DBPoolMax:     4,
		DBPoolMinIdle: 1,
	}

	bunDB, err := db.New(ctx, cfg)
	if err != nil {
		_ = pg.Terminate(ctx)
		t.Fatalf("db.New: %v", err)
	}

	cleanup := func() {
		if bunDB != nil {
			_ = bunDB.Close()
		}
		_ = pg.Terminate(ctx)
	}

	return repos.NewIdentityRepo(bunDB), cleanup
}

func TestIdentityRepoUpsertAndLink(t *testing.T) {
	repo, cleanup := testBunDB(t)
	defer cleanup()

	ctx := context.Background()
	const discord = "999000111222333444"
	platform := "uplay"

	player, err := repo.UpsertPlayerByIdentity(ctx, models.GameR6, "TestUser", platform, nil, nil)
	if err != nil {
		t.Fatalf("UpsertPlayerByIdentity: %v", err)
	}
	if player.ID == 0 {
		t.Fatal("expected player id")
	}

	identity, err := repo.LinkDiscordIdentity(ctx, models.GameR6, discord, player.ID)
	if err != nil {
		t.Fatalf("LinkDiscordIdentity: %v", err)
	}
	if identity.PlayerID != player.ID {
		t.Fatalf("player_id = %d, want %d", identity.PlayerID, player.ID)
	}

	otherPlayer, err := repo.UpsertPlayerByIdentity(ctx, models.GameR6, "OtherUser", platform, nil, nil)
	if err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	rel, err := repo.LinkDiscordIdentity(ctx, models.GameR6, discord, otherPlayer.ID)
	if err != nil {
		t.Fatalf("relink: %v", err)
	}
	if rel.PlayerID != otherPlayer.ID {
		t.Fatalf("relink player_id = %d, want %d", rel.PlayerID, otherPlayer.ID)
	}

	// The multi_platform_discord_links migration dropped the unique
	// (game, discord_user_id) index so one Discord user can link multiple
	// R6 players, so linking a second player adds a distinct identity row.
	game := models.GameR6
	rows, err := repo.FindDiscordIdentities(ctx, &game, discord)
	if err != nil {
		t.Fatalf("FindDiscordIdentities: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("identities len = %d, want 2", len(rows))
	}

	found, err := repo.FindPlayerByIdentity(ctx, models.GameR6, "TestUser", platform)
	if err != nil {
		t.Fatalf("FindPlayerByIdentity: %v", err)
	}
	if found == nil || found.ID != player.ID {
		t.Fatalf("FindPlayerByIdentity mismatch")
	}

	// An empty platform filter removes every identity linked to the Discord user.
	n, err := repo.UnlinkDiscordIdentity(ctx, models.GameR6, discord, "")
	if err != nil {
		t.Fatalf("UnlinkDiscordIdentity: %v", err)
	}
	if n != 2 {
		t.Fatalf("unlink rows = %d, want 2", n)
	}
}

func TestListDiscordIdentitiesCursor(t *testing.T) {
	repo, cleanup := testBunDB(t)
	defer cleanup()

	ctx := context.Background()
	const discord = "888777666555444333"

	p, err := repo.UpsertPlayerByIdentity(ctx, models.GameR6, "R6User", "uplay", nil, nil)
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	_, err = repo.LinkDiscordIdentity(ctx, models.GameR6, discord, p.ID)
	if err != nil {
		t.Fatalf("link: %v", err)
	}

	page1, err := repo.ListDiscordIdentitiesByDiscord(ctx, discord, nil, "", 10)
	if err != nil {
		t.Fatalf("page1: %v", err)
	}
	if len(page1.Rows) != 1 {
		t.Fatalf("page1 len = %d, want 1", len(page1.Rows))
	}
	if page1.Rows[0].PlayerID != p.ID {
		t.Fatalf("player id = %d, want %d", page1.Rows[0].PlayerID, p.ID)
	}
}

func TestAnonymizePlayerNoIdentities(t *testing.T) {
	repo, cleanup := testBunDB(t)
	defer cleanup()

	ctx := context.Background()
	report, err := repo.AnonymizePlayer(ctx, "no-such-user", "secret")
	if err != nil {
		t.Fatalf("AnonymizePlayer: %v", err)
	}
	if report.Players != 0 || report.DiscordIdentities != 0 {
		t.Fatalf("unexpected report: %+v", report)
	}
}

func TestNormalizeUsernameParity(t *testing.T) {
	got := repos.NormalizeUsername("  FooBar  ")
	if got != "foobar" {
		t.Fatalf("got %q want foobar", got)
	}
}
