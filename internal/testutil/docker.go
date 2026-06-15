package testutil

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

// DockerAvailable reports whether a Docker daemon responds to `docker info`.
func DockerAvailable() bool {
	cmd := exec.Command("docker", "info")
	cmd.Stdout = nil
	cmd.Stderr = nil
	return cmd.Run() == nil
}

// PrepareDockerForTestcontainers sets DOCKER_HOST and disables Ryuk when needed so
// testcontainers-go can reach colima / Docker Desktop contexts without panicking.
// Call after DockerAvailable() and before postgres.Run.
func PrepareDockerForTestcontainers(t *testing.T) {
	t.Helper()
	if os.Getenv("DOCKER_HOST") == "" {
		if host := dockerContextHost(); host != "" {
			t.Setenv("DOCKER_HOST", host)
		}
	}
	if os.Getenv("TESTCONTAINERS_RYUK_DISABLED") == "" {
		t.Setenv("TESTCONTAINERS_RYUK_DISABLED", "true")
	}
}

func dockerContextHost() string {
	cmd := exec.Command("docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
