// Package ovi loads and evaluates the deliberately narrow ONNX contract used
// by Parley's matchmaking model. It is not a general ONNX runtime.
package ovi

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"

	"google.golang.org/protobuf/encoding/protowire"
)

const FeatureCount = 6

// Model is the validated LinearRegressor stored in R2.
type Model struct {
	Coefficients [FeatureCount]float64
	Intercept    float64
	SHA256       string
}

func Parse(data []byte) (*Model, error) {
	graph, err := fieldBytes(data, 7)
	if err != nil {
		return nil, fmt.Errorf("onnx graph: %w", err)
	}
	nodes, err := repeatedBytes(graph, 1)
	if err != nil || len(nodes) != 1 {
		return nil, fmt.Errorf("onnx requires exactly one node")
	}
	inputs, _ := repeatedBytes(graph, 11)
	outputs, _ := repeatedBytes(graph, 12)
	if len(inputs) != 1 || len(outputs) != 1 {
		return nil, fmt.Errorf("onnx requires exactly one input and output")
	}
	if err := requireValueInfo(inputs[0], "playstyle_features", FeatureCount); err != nil {
		return nil, fmt.Errorf("onnx input: %w", err)
	}
	if err := requireValueInfo(outputs[0], "variable", 1); err != nil {
		return nil, fmt.Errorf("onnx output: %w", err)
	}
	op, _ := fieldString(nodes[0], 4)
	domain, _ := fieldString(nodes[0], 7)
	if op != "LinearRegressor" || domain != "ai.onnx.ml" {
		return nil, fmt.Errorf("unsupported onnx node %q in domain %q", op, domain)
	}
	attrs, _ := repeatedBytes(nodes[0], 5)
	var coefs []float32
	var intercepts []float32
	postTransform := "NONE"
	for _, a := range attrs {
		name, _ := fieldString(a, 1)
		switch name {
		case "coefficients":
			coefs, err = packedF32(a, 7)
		case "intercepts":
			intercepts, err = packedF32(a, 7)
		case "post_transform":
			postTransform, _ = fieldString(a, 4)
		}
		if err != nil {
			return nil, fmt.Errorf("onnx attribute %s: %w", name, err)
		}
	}
	if postTransform != "" && postTransform != "NONE" {
		return nil, fmt.Errorf("unsupported post_transform %q", postTransform)
	}
	if len(coefs) != FeatureCount || len(intercepts) != 1 {
		return nil, fmt.Errorf("LinearRegressor requires 6 coefficients and 1 intercept")
	}
	m := &Model{Intercept: float64(intercepts[0])}
	for i, v := range coefs {
		m.Coefficients[i] = float64(v)
	}
	if !finite(m.Intercept) {
		return nil, fmt.Errorf("non-finite intercept")
	}
	for _, v := range m.Coefficients {
		if !finite(v) {
			return nil, fmt.Errorf("non-finite coefficient")
		}
	}
	sum := sha256.Sum256(data)
	m.SHA256 = hex.EncodeToString(sum[:])
	return m, nil
}

func (m *Model) Score(features [FeatureCount]float64) (float64, error) {
	score := m.Intercept
	for i, f := range features {
		if !finite(f) {
			return 0, fmt.Errorf("non-finite feature %d", i)
		}
		score += m.Coefficients[i] * f
	}
	if !finite(score) {
		return 0, fmt.Errorf("non-finite model score")
	}
	return score, nil
}

func Clamp(score float64) float64 {
	if score < 0 {
		return 0
	}
	if score > 1 {
		return 1
	}
	return score
}
func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func requireValueInfo(b []byte, want string, lastDim int) error {
	name, _ := fieldString(b, 1)
	if name != want {
		return fmt.Errorf("name = %q, want %q", name, want)
	}
	t, err := fieldBytes(b, 2)
	if err != nil {
		return err
	}
	tensor, err := fieldBytes(t, 1)
	if err != nil {
		return err
	}
	elem, err := fieldVarint(tensor, 1)
	if err != nil || elem != 1 {
		return fmt.Errorf("must be float tensor")
	}
	shape, err := fieldBytes(tensor, 2)
	if err != nil {
		return err
	}
	dims, _ := repeatedBytes(shape, 1)
	if len(dims) != 2 {
		return fmt.Errorf("must have rank 2")
	}
	last, err := fieldVarint(dims[1], 1)
	if err != nil || int(last) != lastDim {
		return fmt.Errorf("last dimension must be %d", lastDim)
	}
	return nil
}
func fieldBytes(b []byte, want protowire.Number) ([]byte, error) {
	xs, err := repeatedBytes(b, want)
	if err != nil || len(xs) != 1 {
		return nil, fmt.Errorf("missing field %d", want)
	}
	return xs[0], nil
}
func repeatedBytes(b []byte, want protowire.Number) (out [][]byte, err error) {
	for len(b) > 0 {
		n, t, k := protowire.ConsumeTag(b)
		if k < 0 {
			return nil, protowire.ParseError(k)
		}
		b = b[k:]
		if t == protowire.BytesType {
			v, c := protowire.ConsumeBytes(b)
			if c < 0 {
				return nil, protowire.ParseError(c)
			}
			if n == want {
				out = append(out, v)
			}
			b = b[c:]
		} else {
			c := protowire.ConsumeFieldValue(n, t, b)
			if c < 0 {
				return nil, protowire.ParseError(c)
			}
			b = b[c:]
		}
	}
	return out, nil
}
func fieldString(b []byte, want protowire.Number) (string, error) {
	v, e := fieldBytes(b, want)
	return string(v), e
}
func fieldVarint(b []byte, want protowire.Number) (uint64, error) {
	for len(b) > 0 {
		n, t, k := protowire.ConsumeTag(b)
		if k < 0 {
			return 0, protowire.ParseError(k)
		}
		b = b[k:]
		if n == want && t == protowire.VarintType {
			v, c := protowire.ConsumeVarint(b)
			if c < 0 {
				return 0, protowire.ParseError(c)
			}
			return v, nil
		}
		c := protowire.ConsumeFieldValue(n, t, b)
		if c < 0 {
			return 0, protowire.ParseError(c)
		}
		b = b[c:]
	}
	return 0, fmt.Errorf("missing field %d", want)
}
func packedF32(b []byte, want protowire.Number) ([]float32, error) {
	var out []float32
	for len(b) > 0 {
		n, typ, k := protowire.ConsumeTag(b)
		if k < 0 {
			return nil, protowire.ParseError(k)
		}
		b = b[k:]
		if n == want && typ == protowire.Fixed32Type {
			v, c := protowire.ConsumeFixed32(b)
			if c < 0 {
				return nil, protowire.ParseError(c)
			}
			out = append(out, math.Float32frombits(v))
			b = b[c:]
			continue
		}
		if n == want && typ == protowire.BytesType {
			raw, c := protowire.ConsumeBytes(b)
			if c < 0 {
				return nil, protowire.ParseError(c)
			}
			b = b[c:]
			for len(raw) > 0 {
				v, c := protowire.ConsumeFixed32(raw)
				if c < 0 {
					return nil, protowire.ParseError(c)
				}
				out = append(out, math.Float32frombits(v))
				raw = raw[c:]
			}
			continue
		}
		c := protowire.ConsumeFieldValue(n, typ, b)
		if c < 0 {
			return nil, protowire.ParseError(c)
		}
		b = b[c:]
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("missing field %d", want)
	}
	return out, nil
}
