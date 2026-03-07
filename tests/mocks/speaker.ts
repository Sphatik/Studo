import { vi } from 'vitest';
import type { IPomodoroSpeaker } from '../../src/commands/pomodoro/pomodoro.js';

export function createMockSpeaker(): IPomodoroSpeaker {
    return {
        playStart: vi.fn(),
        playComplete: vi.fn(),
        playSkipToBreak: vi.fn(),
        playBreakComplete: vi.fn(),
    };
}
