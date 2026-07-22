package ovi

import (
	"context"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const maxModelBytes = 1 << 20

type ObjectGetter interface {
	GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error)
}

func NewR2Client(ctx context.Context, accountID, accessKeyID, secretAccessKey, jurisdiction string) (*s3.Client, error) {
	if accountID == "" || accessKeyID == "" || secretAccessKey == "" {
		return nil, fmt.Errorf("MATCHMAKING_MODEL_R2_ACCOUNT_ID, MATCHMAKING_MODEL_R2_ACCESS_KEY_ID, and MATCHMAKING_MODEL_R2_SECRET_ACCESS_KEY are required")
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion("auto"), awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, "")))
	if err != nil {
		return nil, err
	}
	if jurisdiction == "" {
		jurisdiction = "eu"
	}
	return s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String("https://" + accountID + "." + jurisdiction + ".r2.cloudflarestorage.com")
		o.UsePathStyle = true
	}), nil
}

func Load(ctx context.Context, client ObjectGetter, bucket, key string) (*Model, string, error) {
	out, err := client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return nil, "", fmt.Errorf("download matchmaking model: %w", err)
	}
	defer out.Body.Close()
	b, err := io.ReadAll(io.LimitReader(out.Body, maxModelBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(b) > maxModelBytes {
		return nil, "", fmt.Errorf("matchmaking model exceeds %d bytes", maxModelBytes)
	}
	m, err := Parse(b)
	if err != nil {
		return nil, "", err
	}
	return m, aws.ToString(out.ETag), nil
}
