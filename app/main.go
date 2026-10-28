package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/victoriana/lit-flow-flash/app/internal/agent"
	"github.com/victoriana/lit-flow-flash/app/internal/state"
)

func main() {
	session := state.NewSession("reader-001")
	orch := agent.NewOrchestrator(session)

	fmt.Println("lit-flow-flash :: reading coach (type 'quit' to exit)")
	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Printf("\n[%s] > ", session.Stage())
		if !scanner.Scan() {
			break
		}
		input := strings.TrimSpace(scanner.Text())
		if input == "quit" || input == "exit" {
			break
		}
		if input == "" {
			continue
		}

		response, err := orch.HandleTurn(input)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			continue
		}
		fmt.Println(response)

		// Human-in-the-loop: advance the state machine only on explicit confirm.
		if orch.ReadyToAdvance() {
			fmt.Print("Advance to next milestone? [y/N] ")
			if scanner.Scan() && strings.EqualFold(strings.TrimSpace(scanner.Text()), "y") {
				session.Advance()
				orch.ResetGate()
			}
		}
	}
	fmt.Printf("session saved at stage=%s milestones=%d\n",
		session.Stage(), len(session.Milestones()))
}
