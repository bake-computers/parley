package server

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/adaptor"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: "parley",
		Name:      "http_requests_total",
		Help:      "Total HTTP requests processed by method, route template and status code.",
	}, []string{"method", "route", "status"})

	httpRequestDurationSeconds = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "parley",
		Name:      "http_request_duration_seconds",
		Help:      "HTTP request latency in seconds by method and route template.",
		Buckets:   prometheus.DefBuckets,
	}, []string{"method", "route"})
)

func init() {
	prometheus.MustRegister(httpRequestsTotal, httpRequestDurationSeconds)
}

// NewMetricsApp returns a standalone app serving /metrics on its own listener
// (METRICS_ADDR), so the scrape endpoint stays Docker-internal instead of
// riding along with authenticated application traffic on the service port.
func NewMetricsApp() *fiber.App {
	app := fiber.New()
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))
	return app
}

// metricsMiddleware records request counts and latency per route template.
// Labels use the registered route pattern (e.g. /stats/:username), not the
// raw path, so label cardinality stays bounded. It is registered after the
// auth middleware so c.Route() resolves to the matched endpoint, and records
// panics as 500 before re-raising them for the recover middleware.
func metricsMiddleware() fiber.Handler {
	return func(c fiber.Ctx) (err error) {
		// Skip operational probes: load-balancer health checks and
		// Prometheus scrapes would otherwise dominate the counters.
		switch c.Path() {
		case "/health", "/ready":
			return c.Next()
		}

		start := time.Now()
		defer func() {
			r := recover()
			status := fiber.StatusInternalServerError
			if r == nil {
				status = c.Response().StatusCode()
				if err != nil {
					if fe, ok := err.(*fiber.Error); ok {
						status = fe.Code
					} else if status < 400 {
						status = fiber.StatusInternalServerError
					}
				}
			}

			route := c.Route().Path
			if route == "" {
				route = "unmatched"
			}
			httpRequestsTotal.WithLabelValues(c.Method(), route, strconv.Itoa(status)).Inc()
			httpRequestDurationSeconds.WithLabelValues(c.Method(), route).Observe(time.Since(start).Seconds())

			if r != nil {
				panic(r)
			}
		}()
		return c.Next()
	}
}
