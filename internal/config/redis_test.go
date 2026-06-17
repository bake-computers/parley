package config_test

import (
	"testing"

	"github.com/pactum-computers/parley/internal/config"
)

func TestRedisOptions_URL(t *testing.T) {
	opts, err := config.RedisOptions("redis://:secret@127.0.0.1:6379/2")
	if err != nil {
		t.Fatalf("RedisOptions: %v", err)
	}
	if opts.Addr != "127.0.0.1:6379" {
		t.Errorf("Addr = %q", opts.Addr)
	}
	if opts.Password != "secret" {
		t.Errorf("Password = %q", opts.Password)
	}
	if opts.DB != 2 {
		t.Errorf("DB = %d, want 2", opts.DB)
	}
}

func TestRedisOptions_BareAddr(t *testing.T) {
	opts, err := config.RedisOptions("127.0.0.1:6379")
	if err != nil {
		t.Fatalf("RedisOptions: %v", err)
	}
	if opts.Addr != "127.0.0.1:6379" {
		t.Errorf("Addr = %q", opts.Addr)
	}
}

func TestRedisOptions_Empty(t *testing.T) {
	if _, err := config.RedisOptions(""); err == nil {
		t.Fatal("expected error for empty url")
	}
}
