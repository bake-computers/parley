package logging

import "encoding/json"

func encodeEvent(fields map[string]any) []byte {
	b, err := json.Marshal(fields)
	if err != nil {
		return nil
	}
	return b
}
