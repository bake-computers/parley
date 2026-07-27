package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	statsv1 "github.com/bake-computers/parley/gen/parley/stats/v1"
	"github.com/bake-computers/parley/gen/parley/stats/v1/statsv1connect"
	"github.com/bake-computers/parley/internal/apperr"
	"github.com/bake-computers/parley/internal/services"
	"github.com/bake-computers/parley/internal/stats/fetch"
)

// StatsHandler serves parley.stats.v1.StatsService via ConnectRPC.
type StatsHandler struct {
	statsv1connect.UnimplementedStatsServiceHandler
	svc *services.StatsService
}

// NewStatsHandler returns a handler backed by the given service.
func NewStatsHandler(svc *services.StatsService) *StatsHandler {
	return &StatsHandler{svc: svc}
}

var _ statsv1connect.StatsServiceHandler = (*StatsHandler)(nil)

// FetchStats fetches stats for a single season selector (or latest when unset).
func (h *StatsHandler) FetchStats(
	ctx context.Context,
	req *connect.Request[statsv1.FetchStatsRequest],
) (*connect.Response[statsv1.FetchStatsResponse], error) {
	username := strings.TrimSpace(req.Msg.GetUsername())
	if username == "" {
		return connect.NewResponse(&statsv1.FetchStatsResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "username is required"),
		}), nil
	}

	platform := services.MapProtoPlatform(req.Msg.GetPlatform())

	stats, err := h.svc.FetchStats(ctx, username, platform, req.Msg.GetSeasonSelector())
	if err != nil {
		return nil, mapStatsErr(err)
	}

	return connect.NewResponse(&statsv1.FetchStatsResponse{
		Success: true,
		Stats:   services.ProtoFromScraped(&stats),
	}), nil
}

// FetchStatsCollection fetches stats for every ranked season.
func (h *StatsHandler) FetchStatsCollection(
	ctx context.Context,
	req *connect.Request[statsv1.FetchStatsCollectionRequest],
) (*connect.Response[statsv1.FetchStatsCollectionResponse], error) {
	username := strings.TrimSpace(req.Msg.GetUsername())
	if username == "" {
		return connect.NewResponse(&statsv1.FetchStatsCollectionResponse{
			Success: false,
			Error:   errProto(apperr.CodeInvalidArgument, "username is required"),
		}), nil
	}

	platform := services.MapProtoPlatform(req.Msg.GetPlatform())

	collection, err := h.svc.FetchStatsCollection(ctx, username, platform)
	if err != nil {
		return nil, mapStatsErr(err)
	}

	return connect.NewResponse(&statsv1.FetchStatsCollectionResponse{
		Success:    true,
		Collection: services.ProtoFromCollection(&collection),
	}), nil
}

// mapStatsErr converts fetch.StatsFetchError to a connect.Error with
// appropriate status code mapping.
func mapStatsErr(err error) error {
	if cerr, ok := err.(*connect.Error); ok {
		return cerr
	}
	if ferr, ok := err.(*fetch.StatsFetchError); ok {
		code := statsFetchErrorCode(ferr.Kind)
		return apperr.New(code, ferr.Message)
	}
	return apperr.Internal(err.Error())
}

func statsFetchErrorCode(kind fetch.StatsFetchErrorKind) string {
	switch kind {
	case fetch.StatsFetchErrorProfileNotFound, fetch.StatsFetchErrorSeasonNotFound:
		return apperr.CodeNotFound
	case fetch.StatsFetchErrorInvalidProfile, fetch.StatsFetchErrorInvalidPayload:
		return apperr.CodeInternal
	case fetch.StatsFetchErrorGcUnavailable:
		return apperr.CodeFailedPrecondition
	default:
		return apperr.CodeInternal
	}
}

// --- Optional REST handler ---

// StatsRESTHandler returns an http.HandlerFunc for GET /stats/{username}.
// This is the debug REST endpoint matching Rust stats_get. Mount on any
// net/http-compatible router.
func StatsRESTHandler(svc *services.StatsService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract username from path: /stats/{username}
		path := strings.TrimPrefix(r.URL.Path, "/stats/")
		username := strings.TrimSpace(strings.Split(path, "/")[0])
		if username == "" {
			writeRESTError(w, http.StatusBadRequest, "InvalidArgument", "username is required")
			return
		}

		q := r.URL.Query()

		// Parse platform.
		platform := fetch.StatsPlatformAuto
		switch strings.ToLower(q.Get("platform")) {
		case "pc":
			platform = fetch.StatsPlatformPC
		case "xbox":
			platform = fetch.StatsPlatformXbox
		case "playstation":
			platform = fetch.StatsPlatformPlaystation
		case "", "auto":
			// default
		default:
			writeRESTError(w, http.StatusBadRequest, "InvalidArgument", "unsupported platform: "+q.Get("platform"))
			return
		}

		// Validate game (R6 only).
		gameParam := strings.ToLower(q.Get("game"))
		if gameParam != "" && gameParam != "r6" {
			writeRESTError(w, http.StatusBadRequest, "InvalidArgument", "unsupported game: "+q.Get("game"))
			return
		}

		season := q.Get("season")

		stats, err := svc.FetchStats(r.Context(), username, platform, season)
		if err != nil {
			status, code := mapRESTStatus(err)
			writeRESTError(w, status, code, err.Error())
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(stats); err != nil {
			slog.Error("encode stats response", "error", err)
		}
	}
}

func mapRESTStatus(err error) (int, string) {
	if ferr, ok := err.(*fetch.StatsFetchError); ok {
		switch ferr.Kind {
		case fetch.StatsFetchErrorProfileNotFound, fetch.StatsFetchErrorSeasonNotFound:
			return http.StatusNotFound, "NotFound"
		case fetch.StatsFetchErrorInvalidProfile, fetch.StatsFetchErrorInvalidPayload:
			return http.StatusBadGateway, "BadGateway"
		case fetch.StatsFetchErrorGcUnavailable:
			return http.StatusServiceUnavailable, "ServiceUnavailable"
		default:
			return http.StatusServiceUnavailable, "ServiceUnavailable"
		}
	}
	return http.StatusInternalServerError, "Internal"
}

func writeRESTError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(map[string]string{
		"code":    code,
		"message": message,
	}); err != nil {
		slog.Error("encode REST error", "error", err)
	}
}
