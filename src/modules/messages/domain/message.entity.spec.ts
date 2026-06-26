import { Message } from './message.entity';

describe('Message entity', () => {
  const base = {
    tenantId: 'tenant-a',
    conversationId: 'conv-1',
    senderId: 'user-1',
    content: 'hello',
  };

  it('creates a message with a generated id and timestamp', () => {
    const message = Message.create(base);
    const props = message.toJSON();
    expect(props.id).toBeDefined();
    expect(props.id.length).toBeGreaterThan(0);
    expect(props.timestamp).toBeInstanceOf(Date);
    expect(props.tenantId).toBe('tenant-a');
    expect(props.conversationId).toBe('conv-1');
    expect(props.content).toBe('hello');
  });

  it('trims content', () => {
    const message = Message.create({ ...base, content: '   hi   ' });
    expect(message.content).toBe('hi');
  });

  it('rejects empty content', () => {
    expect(() => Message.create({ ...base, content: '' })).toThrow(/content/);
    expect(() => Message.create({ ...base, content: '   ' })).toThrow(/content/);
  });

  it('rejects oversized content', () => {
    expect(() => Message.create({ ...base, content: 'x'.repeat(8001) })).toThrow(/length/);
  });

  it('requires tenantId, conversationId, and senderId', () => {
    expect(() => Message.create({ ...base, tenantId: '' })).toThrow(/tenantId/);
    expect(() => Message.create({ ...base, conversationId: '' })).toThrow(/conversationId/);
    expect(() => Message.create({ ...base, senderId: '' })).toThrow(/senderId/);
  });

  it('rehydrates without revalidating', () => {
    const props = {
      id: 'fixed-id',
      tenantId: 'tenant-a',
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'persisted',
      timestamp: new Date('2026-01-01T00:00:00Z'),
    };
    const message = Message.rehydrate(props);
    expect(message.toJSON()).toEqual(props);
  });
});
