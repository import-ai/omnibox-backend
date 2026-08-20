import { HttpStatus } from '@nestjs/common';

import { ConversationSharesService } from './conversation-shares.service';
import { ConversationShareChannel } from './entities/conversation-share-event.entity';

describe('ConversationSharesService', () => {
  const conversationRepo = {
    findOne: jest.fn(),
  };
  const messageRepo = {
    find: jest.fn(),
  };
  const shareRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const groupRepo = {
    create: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, defaultValue?: string) =>
      key === 'OBB_BASE_URL' ? 'https://test.omnibox.pro' : defaultValue,
    ),
  };

  function createService() {
    return new ConversationSharesService(
      conversationRepo as never,
      messageRepo as never,
      shareRepo as never,
      groupRepo as never,
      config as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    shareRepo.create.mockImplementation((value) => value);
    groupRepo.create.mockImplementation((value) => value);
    shareRepo.save.mockImplementation((value) => value);
  });

  it('creates an immutable snapshot in selected chronological group order', async () => {
    conversationRepo.findOne.mockResolvedValue({
      id: 'conversation-1',
      namespaceId: 'namespace-1',
      userId: 'user-1',
      title: 'A useful conversation',
    });
    messageRepo.find.mockResolvedValue([
      message('question-1', null, 'user', 'First question'),
      message('answer-1', 'question-1', 'assistant', 'First answer'),
      message('question-2', 'answer-1', 'user', 'Second question'),
      message('answer-2', 'question-2', 'assistant', 'Second answer'),
    ]);
    shareRepo.save.mockImplementation((value) => ({
      ...value,
      id: 'share-1',
    }));

    const result = await createService().create('namespace-1', 'user-1', {
      channel: ConversationShareChannel.COPY_LINK,
      conversation_id: 'conversation-1',
      group_ids: ['question-2', 'question-1'],
    });

    expect(groupRepo.create).toHaveBeenCalledWith([
      expect.objectContaining({
        ordinal: 0,
        questionContent: 'First question',
        answerContent: 'First answer',
      }),
      expect.objectContaining({
        ordinal: 1,
        questionContent: 'Second question',
        answerContent: 'Second answer',
      }),
    ]);
    expect(result).toEqual({
      id: 'share-1',
      url: 'https://test.omnibox.pro/zh-cn/conversation-share/?share_id=share-1',
      title: 'A useful conversation',
      summary: 'First answer',
    });
  });

  it('rejects a request while any message is streaming', async () => {
    conversationRepo.findOne.mockResolvedValue({
      id: 'conversation-1',
      namespaceId: 'namespace-1',
      userId: 'user-1',
      title: '',
    });
    messageRepo.find.mockResolvedValue([
      message('question-1', null, 'user', 'Question'),
      message('answer-1', 'question-1', 'assistant', 'Answer', 'streaming'),
    ]);

    await expect(
      createService().create('namespace-1', 'user-1', {
        channel: ConversationShareChannel.COPY_LINK,
        conversation_id: 'conversation-1',
        group_ids: ['question-1'],
      }),
    ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
  });

  it('permanently invalidates every active snapshot when its source conversation is deleted', async () => {
    await createService().invalidateBySourceConversation('conversation-1');

    expect(shareRepo.update).toHaveBeenCalledWith(
      { sourceConversationId: 'conversation-1', status: 'active' },
      expect.objectContaining({
        status: 'invalid',
        invalidatedAt: expect.any(Date),
      }),
    );
  });
});

function message(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  content: string,
  status = 'success',
) {
  return {
    id,
    parentId,
    status,
    message: { role, content },
    createdAt: new Date(),
  };
}
