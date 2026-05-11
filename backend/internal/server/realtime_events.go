package server

import (
	"context"
	"encoding/json"
)

type realtimeEvent struct {
	Type    string         `json:"type"`
	Targets []int64        `json:"targets"`
	Message map[string]any `json:"message,omitempty"`
	Meta    map[string]any `json:"meta,omitempty"`
}

func (s *Server) publishRealtimeEvent(ctx context.Context, eventType string, targets []int64, message map[string]any, meta map[string]any) {
	if s.redis == nil || eventType == "" || len(targets) == 0 {
		return
	}
	raw, err := json.Marshal(realtimeEvent{
		Type:    eventType,
		Targets: targets,
		Message: message,
		Meta:    meta,
	})
	if err != nil {
		return
	}
	_ = s.redis.Publish(ctx, "realtime:events", raw).Err()
}
