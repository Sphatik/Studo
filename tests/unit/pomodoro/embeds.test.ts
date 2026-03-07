import { describe, it, expect } from 'vitest';
import {
    embedTimerStatus,
    embedCompleteStartBreak,
    embedBreakActive,
    embedBreakOver,
    embedUserJoined,
    _createStartTimerButtons,
    _createCompleteStartBreakButtons,
} from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockSession } from '../../mocks/database.js';
import type { PomodoroSession } from '../../../src/database/models/PomodoroSession.js';

describe('embedTimerStatus', () => {
    it('includes duration, break, endsAt fields', () => {
        const session = createMockSession({ duration: 30, breakDuration: 10 });
        const result = embedTimerStatus(session, 'Test Title', false);
        const embed = (result as { embeds: { data: { fields: { name: string; value: string }[] } }[] }).embeds[0];
        const fields = embed.data.fields;

        expect(fields.find((f: { name: string }) => f.name === 'Duration')?.value).toBe('30 minutes');
        expect(fields.find((f: { name: string }) => f.name === 'Break')?.value).toBe('10 minutes');
        expect(fields.find((f: { name: string }) => f.name === 'Ends At')).toBeDefined();
    });

    it('has empty components when hasButtons=false', () => {
        const session = createMockSession();
        const result = embedTimerStatus(session, 'Title', false) as { components: unknown[] };
        expect(result.components).toHaveLength(0);
    });

    it('has action row when hasButtons=true', () => {
        const session = createMockSession();
        const result = embedTimerStatus(session, 'Title', true) as { components: unknown[] };
        expect(result.components).toHaveLength(1);
    });

    it('includes voice channel field when voiceChannelId is set', () => {
        const session = createMockSession({ voiceChannelId: 'vc-999' });
        const result = embedTimerStatus(session, 'Title', false);
        const embed = (result as { embeds: { data: { fields: { name: string }[] } }[] }).embeds[0];
        expect(embed.data.fields.find((f: { name: string }) => f.name === 'Voice Channel')).toBeDefined();
    });

    it('does not include voice channel field when voiceChannelId is null', () => {
        const session = createMockSession({ voiceChannelId: null });
        const result = embedTimerStatus(session, 'Title', false);
        const embed = (result as { embeds: { data: { fields: { name: string }[] } }[] }).embeds[0];
        expect(embed.data.fields.find((f: { name: string }) => f.name === 'Voice Channel')).toBeUndefined();
    });

    it('lists participants in the Participants field', () => {
        const session = createMockSession({ participants: ['user-1', 'user-2'] });
        const result = embedTimerStatus(session, 'Title', false);
        const embed = (result as { embeds: { data: { fields: { name: string; value: string }[] } }[] }).embeds[0];
        const participantsField = embed.data.fields.find((f: { name: string }) => f.name === 'Participants');
        expect(participantsField?.value).toContain('<@user-1>');
        expect(participantsField?.value).toContain('<@user-2>');
    });
});

describe('embedCompleteStartBreak', () => {
    it('mentions all participants in content string', () => {
        const session = createMockSession({ participants: ['user-1', 'user-2'] });
        const result = embedCompleteStartBreak(session);
        expect((result as { content: string }).content).toContain('<@user-1>');
        expect((result as { content: string }).content).toContain('<@user-2>');
    });

    it('has 3 buttons (break/repeat/end)', () => {
        const session = createMockSession();
        const result = embedCompleteStartBreak(session) as { components: { components: unknown[] }[] };
        expect(result.components).toHaveLength(1);
        expect(result.components[0].components).toHaveLength(3);
    });

    it('uses custom title when provided', () => {
        const session = createMockSession();
        const result = embedCompleteStartBreak(session, 'Pomodoro Skipped!');
        const embed = (result as { embeds: { data: { title: string } }[] }).embeds[0];
        expect(embed.data.title).toBe('Pomodoro Skipped!');
    });
});

describe('embedBreakActive', () => {
    it('shows break duration in description', () => {
        const session = createMockSession({ breakDuration: 10 }) as unknown as PomodoroSession;
        const result = embedBreakActive(session) as { embeds: { data: { description: string } }[] };
        expect(result.embeds[0].data.description).toContain('10 minute break');
    });

    it('has skip break button', () => {
        const session = createMockSession({ id: 42 }) as unknown as PomodoroSession;
        const result = embedBreakActive(session) as { components: { components: { data: { custom_id: string } }[] }[] };
        expect(result.components[0].components[0].data.custom_id).toBe('pomodoro-skipbreak_42');
    });
});

describe('embedBreakOver', () => {
    it('has repeat and dismiss buttons', () => {
        const session = createMockSession({ id: 7 });
        const result = embedBreakOver(session) as { components: { components: { data: { custom_id: string } }[] }[] };
        const buttonIds = result.components[0].components.map((b) => b.data.custom_id);
        expect(buttonIds).toContain('pomodoro-repeat_7');
        expect(buttonIds).toContain('pomodoro-end_7');
    });

    it('mentions participants in content', () => {
        const session = createMockSession({ participants: ['user-a'] });
        const result = embedBreakOver(session) as { content: string };
        expect(result.content).toContain('<@user-a>');
    });
});

describe('embedUserJoined', () => {
    it('shows the joined user name', () => {
        const session = createMockSession({ participants: ['user-123', 'user-456'] }) as unknown as PomodoroSession;
        const embed = embedUserJoined(session, 'Alice');
        const data = (embed as unknown as { data: { description: string } }).data;
        expect(data.description).toContain('Alice');
    });
});

describe('_createStartTimerButtons', () => {
    it('has join, leave, skip-to-break buttons with correct customIds', () => {
        const session = createMockSession({ id: 5 });
        const row = _createStartTimerButtons(session) as unknown as { components: { data: { custom_id: string } }[] };
        const ids = row.components.map((b) => b.data.custom_id);
        expect(ids).toContain('pomodoro-join_5');
        expect(ids).toContain('pomodoro-leave_5');
        expect(ids).toContain('pomodoro-skiptobreak_5');
    });
});

describe('_createCompleteStartBreakButtons', () => {
    it('has break, repeat, end buttons with correct customIds', () => {
        const session = createMockSession({ id: 9, breakDuration: 10 });
        const row = _createCompleteStartBreakButtons(session) as unknown as { components: { data: { custom_id: string } }[] };
        const ids = row.components.map((b) => b.data.custom_id);
        expect(ids).toContain('pomodoro-break_9');
        expect(ids).toContain('pomodoro-repeat_9');
        expect(ids).toContain('pomodoro-end_9');
    });
});
