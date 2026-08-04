package server

import (
	"strconv"
	"strings"
	"time"

	guildv1 "github.com/bake-computers/parley/gen/parley/guild/v1"
	identityv1 "github.com/bake-computers/parley/gen/parley/identity/v1"
	matchmakingv1 "github.com/bake-computers/parley/gen/parley/matchmaking/v1"
	statsv1 "github.com/bake-computers/parley/gen/parley/stats/v1"
	tournamentv1 "github.com/bake-computers/parley/gen/parley/tournament/v1"
	userv1 "github.com/bake-computers/parley/gen/parley/user/v1"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/adaptor"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/protobuf/reflect/protoreflect"
)

var (
	httpRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: "parley",
		Name:      "http_requests_total",
		Help:      "Total application HTTP requests by method, route template, RPC procedure and status code.",
	}, []string{"method", "route", "procedure", "status"})

	httpRequestDurationSeconds = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "parley",
		Name:      "http_request_duration_seconds",
		Help:      "Application HTTP request latency in seconds by method, route template and RPC procedure.",
		Buckets: []float64{
			0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25,
			0.5, 1, 2.5, 5, 10, 20, 30,
		},
	}, []string{"method", "route", "procedure"})

	httpRequestsInFlight = prometheus.NewGauge(prometheus.GaugeOpts{
		Namespace: "parley",
		Name:      "http_requests_in_flight",
		Help:      "Current number of application HTTP requests being processed, excluding health, readiness and metrics scrapes.",
	})
)

func init() {
	prometheus.MustRegister(httpRequestsTotal, httpRequestDurationSeconds, httpRequestsInFlight)
}

var rpcProcedures = buildRPCProcedureSet(
	guildv1.File_guild_v1_guild_proto,
	identityv1.File_identity_v1_identity_proto,
	matchmakingv1.File_matchmaking_v1_matchmaking_proto,
	statsv1.File_stats_v1_stats_proto,
	tournamentv1.File_tournament_v1_tournament_proto,
	userv1.File_user_v1_user_proto,
)

func buildRPCProcedureSet(files ...protoreflect.FileDescriptor) map[string]struct{} {
	procedures := make(map[string]struct{})
	for _, file := range files {
		services := file.Services()
		for i := 0; i < services.Len(); i++ {
			service := services.Get(i)
			methods := service.Methods()
			for j := 0; j < methods.Len(); j++ {
				method := methods.Get(j)
				procedure := "/" + string(service.FullName()) + "/" + string(method.Name())
				procedures[procedure] = struct{}{}
			}
		}
	}
	return procedures
}

// NewMetricsApp returns a standalone app serving /metrics on its own listener
// (METRICS_ADDR), so the scrape endpoint stays Docker-internal instead of
// riding along with authenticated application traffic on the service port.
func NewMetricsApp() *fiber.App {
	app := fiber.New()
	app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))
	return app
}

// metricsMiddleware records request counts and latency for application traffic.
// Labels use the registered route pattern (e.g. /stats/:username), not the
// raw path, so label cardinality stays bounded. It runs before authentication
// so rejected API requests are visible too; those requests have no matched
// endpoint and use the bounded "unmatched" route label.
func metricsMiddleware() fiber.Handler {
	return func(c fiber.Ctx) (err error) {
		// Skip operational probes: load-balancer health checks and
		// Prometheus scrapes would otherwise dominate the counters.
		switch c.Path() {
		case "/health", "/ready", "/metrics":
			return c.Next()
		}

		start := time.Now()
		httpRequestsInFlight.Inc()
		defer func() {
			httpRequestsInFlight.Dec()
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

			route, procedure := requestMetricLabels(c)
			httpRequestsTotal.WithLabelValues(c.Method(), route, procedure, strconv.Itoa(status)).Inc()
			httpRequestDurationSeconds.WithLabelValues(c.Method(), route, procedure).Observe(time.Since(start).Seconds())

			if r != nil {
				panic(r)
			}
		}()
		return c.Next()
	}
}

func requestMetricLabels(c fiber.Ctx) (route, procedure string) {
	route = c.Route().Path
	if route == "" || route == "/" {
		route = "unmatched"
	}

	// A known procedure is safe to use even when authentication rejected the
	// request before Fiber matched the Connect wildcard route. Unknown method
	// names collapse to one bounded value instead of becoming label values.
	if _, ok := rpcProcedures[c.Path()]; ok {
		return route, c.Path()
	}
	if strings.HasPrefix(route, "/parley.") && strings.HasSuffix(route, "/*") {
		return route, "unknown"
	}
	return route, "none"
}
