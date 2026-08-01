package ovi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"math"
	"os"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"google.golang.org/protobuf/encoding/protowire"
)

// TestLiveArtifact is intentionally opt-in: regular tests never require R2.
func TestLiveArtifact(t *testing.T) {
	account, key, secret := os.Getenv("MATCHMAKING_MODEL_R2_ACCOUNT_ID"), os.Getenv("MATCHMAKING_MODEL_R2_ACCESS_KEY_ID"), os.Getenv("MATCHMAKING_MODEL_R2_SECRET_ACCESS_KEY")
	pin := os.Getenv("MATCHMAKING_MODEL_R2_SHA256")
	if account == "" || key == "" || secret == "" || pin == "" {
		t.Skip("R2 model credentials not configured")
	}
	c, err := NewR2Client(context.Background(), account, key, secret, os.Getenv("MATCHMAKING_MODEL_R2_JURISDICTION"))
	if err != nil {
		t.Fatal(err)
	}
	m, _, err := Load(context.Background(), c, "ovi", "ovi_model.onnx", pin)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Score([FeatureCount]float64{}); err != nil {
		t.Fatal(err)
	}
}

func TestParseAndScoreLinearRegressor(t *testing.T) {
	m, err := Parse(testModel())
	if err != nil {
		t.Fatal(err)
	}
	got, err := m.Score([FeatureCount]float64{1, 2, 3, 4, 5, 6})
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(got-91.5) > 1e-6 {
		t.Fatalf("score=%v want 91.5", got)
	}
	if Clamp(-1) != 0 || Clamp(2) != 1 {
		t.Fatal("clamp failed")
	}
}

func TestParseRejectsWrongInput(t *testing.T) {
	b := testModel()
	b = replaceFirst(b, []byte("playstyle_features"), []byte("wrong______________"))
	if _, err := Parse(b); err == nil {
		t.Fatal("expected validation failure")
	}
}

type stubObjectGetter struct{ body []byte }

func (s stubObjectGetter) GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	return &s3.GetObjectOutput{Body: io.NopCloser(bytes.NewReader(s.body)), ETag: aws.String("etag")}, nil
}

func TestLoadRejectsDigestMismatch(t *testing.T) {
	stub := stubObjectGetter{body: testModel()}
	_, _, err := Load(context.Background(), stub, "b", "k", strings.Repeat("0", 64))
	if err == nil || !strings.Contains(err.Error(), "sha256 mismatch") {
		t.Fatalf("expected sha256 mismatch error, got %v", err)
	}
}

func TestLoadAcceptsPinnedDigest(t *testing.T) {
	body := testModel()
	sum := sha256.Sum256(body)
	stub := stubObjectGetter{body: body}
	if _, _, err := Load(context.Background(), stub, "b", "k", hex.EncodeToString(sum[:])); err != nil {
		t.Fatal(err)
	}
}

func testModel() []byte {
	attr := func(name string, values []float32) []byte {
		var raw []byte
		for _, v := range values {
			raw = protowire.AppendFixed32(raw, math.Float32bits(v))
		}
		var b []byte
		b = putBytes(b, 1, []byte(name))
		return putBytes(b, 7, raw)
	}
	var node []byte
	node = putBytes(node, 4, []byte("LinearRegressor"))
	node = putBytes(node, 7, []byte("ai.onnx.ml"))
	node = putBytes(node, 5, attr("coefficients", []float32{1, 2, 3, 4, 5, 6}))
	node = putBytes(node, 5, attr("intercepts", []float32{0.5}))
	var graph []byte
	graph = putBytes(graph, 1, node)
	graph = putBytes(graph, 11, valueInfo("playstyle_features", 6))
	graph = putBytes(graph, 12, valueInfo("variable", 1))
	return putBytes(nil, 7, graph)
}
func valueInfo(name string, width uint64) []byte {
	var dim0, dim1, shape, tensor, typ, b []byte
	dim0 = putVarint(dim0, 2, 1)
	dim1 = putVarint(dim1, 1, width)
	shape = putBytes(shape, 1, dim0)
	shape = putBytes(shape, 1, dim1)
	tensor = putVarint(tensor, 1, 1)
	tensor = putBytes(tensor, 2, shape)
	typ = putBytes(typ, 1, tensor)
	b = putBytes(b, 1, []byte(name))
	return putBytes(b, 2, typ)
}
func putBytes(b []byte, n protowire.Number, v []byte) []byte {
	b = protowire.AppendTag(b, n, protowire.BytesType)
	return protowire.AppendBytes(b, v)
}
func putVarint(b []byte, n protowire.Number, v uint64) []byte {
	b = protowire.AppendTag(b, n, protowire.VarintType)
	return protowire.AppendVarint(b, v)
}
func replaceFirst(b, old, new []byte) []byte {
	for i := 0; i+len(old) <= len(b); i++ {
		ok := true
		for j := range old {
			if b[i+j] != old[j] {
				ok = false
				break
			}
		}
		if ok {
			copy(b[i:i+len(old)], new)
			return b
		}
	}
	return b
}
