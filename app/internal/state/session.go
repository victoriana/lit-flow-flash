// Package state tracks reader milestones and user session history.
package state

import (
	"time"
)

// Stage is a position in the reading state machine.
type Stage string

const (
	StageSelecting Stage = "selecting"
	StageReading   Stage = "reading"
	StageReflecting Stage = "reflecting"
	StageComplete  Stage = "complete"
)

var progression = []Stage{StageSelecting, StageReading, StageReflecting, StageComplete}

// Milestone records that the reader completed a bounded unit of text.
type Milestone struct {
	TextID    string
	ChunkIdx  int
	CompletedAt time.Time
}

// Session is an in-memory reader session. Not safe for concurrent use.
type Session struct {
	UserID     string
	stage      Stage
	idx        int
	milestones []Milestone
	History    []string // raw turn transcript, for later evaluation
}

func NewSession(userID string) *Session {
	return &Session{UserID: userID, stage: StageSelecting}
}

func (s *Session) Stage() Stage { return s.stage }

func (s *Session) Advance() bool {
	if s.idx >= len(progression)-1 {
		s.stage = StageComplete
		return false
	}
	s.idx++
	s.stage = progression[s.idx]
	return true
}

func (s *Session) Record(m Milestone) {
	m.CompletedAt = time.Now().UTC()
	s.milestones = append(s.milestones, m)
}

func (s *Session) Milestones() []Milestone { return s.milestones }

func (s *Session) Note(turn string) { s.History = append(s.History, turn) }
