package tools

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func corpusDir() string {
	if d := os.Getenv("LITFLOW_TEXTS"); d != "" {
		return d
	}
	return filepath.Join("..", "datasets", "texts")
}

type chunkInput struct {
	TextID   string `json:"text_id" jsonschema:"basename of file under datasets/texts, without .txt"`
	ChunkIdx int    `json:"chunk_idx" jsonschema:"zero-based chunk index"`
	MaxRunes int    `json:"max_runes,omitempty" jsonschema:"characters per chunk (default 2000)"`
}

func RegisterBooks(s *mcp.Server) {
	mcp.AddTool(s, &mcp.Tool{
		Name:        "books.get_chunk",
		Description: "Return one bounded chunk of a public-domain text (Fitzgerald / Radcliffe).",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in chunkInput) (*mcp.CallToolResult, any, error) {
		size := in.MaxRunes
		if size <= 0 {
			size = 2000
		}
		path := filepath.Join(corpusDir(), filepath.Base(in.TextID)+".txt")
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, nil, fmt.Errorf("read %s: %w", path, err)
		}
		runes := []rune(string(data))
		start := in.ChunkIdx * size
		if start >= len(runes) {
			return &mcp.CallToolResult{
				Content: []mcp.Content{&mcp.TextContent{Text: "[end of text]"}},
			}, nil, nil
		}
		end := start + size
		if end > len(runes) {
			end = len(runes)
		}
		body := strings.TrimSpace(string(runes[start:end]))
		text := fmt.Sprintf("[%s chunk %d]\n%s", in.TextID, in.ChunkIdx, body)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: text}},
		}, nil, nil
	})
}
