package db

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/breml/rootcerts/embedded"
	"github.com/parley-bot/parley/internal/config"
)

func applyTLS(cfg *config.Config, tlsCfg *tls.Config) error {
	mode := normalizeDBTLS(cfg.DBTLS)

	switch mode {
	case "none":
		return nil
	case "accept-invalid":
		slog.Warn("DB_TLS accept-invalid: skipping TLS certificate verification (dev only)")
		tlsCfg.InsecureSkipVerify = true
		return nil
	case "webpki":
		roots := x509.NewCertPool()
		if !roots.AppendCertsFromPEM([]byte(embedded.MozillaCACertificatesPEM())) {
			return fmt.Errorf("webpki: failed to load Mozilla CA bundle")
		}
		if cfg.DBTLSCAFile != "" {
			if err := appendCAPEM(cfg.DBTLSCAFile, roots); err != nil {
				return err
			}
		}
		tlsCfg.RootCAs = roots
		return nil
	case "system":
		roots, err := x509.SystemCertPool()
		if err != nil {
			roots = x509.NewCertPool()
		}
		if cfg.DBTLSCAFile != "" {
			if err := appendCAPEM(cfg.DBTLSCAFile, roots); err != nil {
				return err
			}
		}
		tlsCfg.RootCAs = roots
		return nil
	default:
		slog.Warn("unknown DB_TLS value; falling back to system", "mode", cfg.DBTLS)
		return applyTLS(&config.Config{DBTLS: "system", DBTLSCAFile: cfg.DBTLSCAFile}, tlsCfg)
	}
}

func normalizeDBTLS(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "system":
		return "system"
	case "webpki":
		return "webpki"
	case "accept-invalid", "insecure":
		return "accept-invalid"
	case "none", "disable", "off":
		return "none"
	default:
		return "unknown"
	}
}

func appendCAPEM(path string, roots *x509.CertPool) error {
	if roots == nil {
		roots = x509.NewCertPool()
	}
	pem, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("opening DB_TLS_CA_FILE at %s: %w", path, err)
	}
	if !roots.AppendCertsFromPEM(pem) {
		return fmt.Errorf("no certificates found in %s", path)
	}
	slog.Info("loaded extra CA certs", "path", path)
	return nil
}
