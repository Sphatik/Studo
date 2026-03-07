import { vi } from 'vitest';

vi.mock('../src/database/index.js', () => ({
    PomodoroSession: {
        create: vi.fn(),
        findOne: vi.fn(),
        findByPk: vi.fn(),
        findAll: vi.fn(),
    },
    PomodoroCycle: {
        bulkCreate: vi.fn(),
        findAll: vi.fn(),
        sequelize: {
            fn: vi.fn((_fnName: string, col: unknown) => `fn(${col})`),
            col: vi.fn((colName: string) => colName),
            literal: vi.fn((val: string) => val),
        },
    },
}));

vi.mock('../src/utils/voice.js', () => ({
    speakTTSCached: vi.fn(),
    joinVC: vi.fn(),
    leaveVC: vi.fn(),
    getConnection: vi.fn(),
    loadTTSCache: vi.fn(),
}));
