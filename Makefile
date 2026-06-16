.PHONY: build test test-integration fmt vet lint proto run clean

BINARY := parley
MAIN_PKG := ./cmd/parley

build:
	go build -o $(BINARY) $(MAIN_PKG)

test:
	go test ./...

test-integration:
	go test -tags=integration ./...

fmt:
	go fmt ./...

vet:
	go vet ./...

lint:
	golangci-lint run ./...

proto:
	buf generate

run: build
	./$(BINARY)

clean:
	rm -f $(BINARY) coverage.out *.test