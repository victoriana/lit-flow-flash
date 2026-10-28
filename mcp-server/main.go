package main

import (
	"context"
	"log"

	"github.com/victoriana/lit-flow-flash/mcp-server/tools"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	server := mcp.NewServer(
	&mcp.Implementation{Name: "lit-flow-flash", Version: "0.1.0"},
	nil, // *mcp.ServerOptions
)

	tools.RegisterBooks(server)
	tools.RegisterUser(server)

	if err := server.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatal(err)
	}
}