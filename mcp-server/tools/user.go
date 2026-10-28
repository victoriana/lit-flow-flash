package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type Milestone struct {
	TextID      string `json:"text_id"`
	ChunkIdx    int    `json:"chunk_idx"`
	CompletedAt string `json:"completed_at"`
}

type historyInput struct {
	UserID string `json:"user_id" jsonschema:"reader session id"`
}

func historyPath(userID string) string {
	base := os.Getenv("LITFLOW_STATE_DIR")
	if base == "" {
		base = filepath.Join("..", ".state")
	}
	return filepath.Join(base, "history-"+filepath.Base(userID)+".json")
}

func RegisterUser(s *mcp.Server) {
	mcp.AddTool(s, &mcp.Tool{
		Name:        "user.read_history",
		Description: "Return the reader's completed milestones as JSON.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in historyInput) (*mcp.CallToolResult, any, error) {
		data, err := os.ReadFile(historyPath(in.UserID))
		if err != nil {
			if os.IsNotExist(err) {
				return &mcp.CallToolResult{
					Content: []mcp.Content{&mcp.TextContent{Text: "[]"}},
				}, nil, nil
			}
			return nil, nil, err
		}
		var ms []Milestone
		if err := json.Unmarshal(data, &ms); err != nil {
			return nil, nil, err
		}
		out, _ := json.MarshalIndent(ms, "", "  ")
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(out)}},
		}, nil, nil
	})
}
