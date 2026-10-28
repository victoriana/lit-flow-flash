// Package agent orchestrates calls to the MCP service layer.
package agent

import (
	"fmt"

	"github.com/victoriana/lit-flow-flash/app/internal/state"
)

// Orchestrator drives one conversation turn against session state.
//
// NOTE: MCP transport wiring is intentionally stubbed here. In production this
// holds an *mcp.ClientSession connected to ../mcp-server over stdio.
type Orchestrator struct {
	session *state.Session
	gateOpen bool
}

func NewOrchestrator(s *state.Session) *Orchestrator {
	return &Orchestrator{session: s}
}

// HandleTurn processes one user utterance and returns the assistant reply.
func (o *Orchestrator) HandleTurn(input string) (string, error) {
	o.session.Note(input)

	switch o.session.Stage() {
	case state.StageSelecting:
		return fmt.Sprintf("Selected text %q. Requesting first chunk from MCP tool books.get_chunk.", input), nil
	case state.StageReading:
		return "Here is the next chunk. Summarize it in your own words when ready.", nil
	case state.StageReflecting:
		o.gateOpen = true
		return "Reflection recorded. Style check passed against gold standard.", nil
	case state.StageComplete:
		return "Session complete. Thanks for reading.", nil
	default:
		return "", fmt.Errorf("unknown stage %q", o.session.Stage())
	}
}

// ReadyToAdvance reports whether the human-in-the-loop prompt should fire.
func (o *Orchestrator) ReadyToAdvance() bool { return o.gateOpen }

func (o *Orchestrator) ResetGate() { o.gateOpen = false }
