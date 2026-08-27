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

  it('snapshots the exact regenerated answer selected by the client', async () => {
    conversationRepo.findOne.mockResolvedValue({
      id: 'conversation-1',
      namespaceId: 'namespace-1',
      userId: 'user-1',
      title: 'Regenerated answer',
    });
    messageRepo.find.mockResolvedValue([
      message('question-1', null, 'user', 'Question'),
      message('answer-old', 'question-1', 'assistant', 'Old answer'),
      message('answer-new', 'question-1', 'assistant', 'Selected answer'),
    ]);
    shareRepo.save.mockImplementation((value) => ({
      ...value,
      id: 'share-1',
    }));

    await createService().create('namespace-1', 'user-1', {
      channel: ConversationShareChannel.COPY_LINK,
      conversation_id: 'conversation-1',
      answer_ids: ['answer-new'],
    });

    expect(groupRepo.create).toHaveBeenCalledWith([
      expect.objectContaining({
        ordinal: 0,
        questionContent: 'Question',
        answerContent: 'Selected answer',
      }),
    ]);
  });

  it('removes internal resource and citation markers from a new snapshot', async () => {
    conversationRepo.findOne.mockResolvedValue({
      id: 'conversation-1',
      namespaceId: 'namespace-1',
      userId: 'user-1',
      title: 'Resource summary',
    });
    messageRepo.find.mockResolvedValue([
      message(
        'question-1',
        null,
        'user',
        '[砌体工程量计算规则](#ifm2qXxxkixL3XE) 总结一下这个文件，保留 [[9]]',
      ),
      message(
        'answer-1',
        'question-1',
        'assistant',
        '结论[[1]](C1-resource)\n\n补充 [[2]]。\n\n1. 第一项\n2. 第二项',
      ),
    ]);

    await createService().create('namespace-1', 'user-1', {
      channel: ConversationShareChannel.COPY_LINK,
      conversation_id: 'conversation-1',
      answer_ids: ['answer-1'],
    });

    expect(groupRepo.create).toHaveBeenCalledWith([
      expect.objectContaining({
        questionContent: '砌体工程量计算规则 总结一下这个文件，保留 [[9]]',
        answerContent: '结论\n\n补充。\n\n1. 第一项\n2. 第二项',
      }),
    ]);
  });

  it('removes internal markers from historical snapshots returned publicly', async () => {
    shareRepo.findOne.mockResolvedValue({
      id: 'share-1',
      title: 'Resource summary',
      summary: 'Summary',
      groups: [
        {
          ordinal: 0,
          questionContent:
            '[砌体工程量计算规则](#ifm2qXxxkixL3XE) 总结一下这个文件，保留 [[9]]',
          answerContent:
            '结论[[1]](C1-resource)\n\n保留普通 [1]。\n\n1. 第一项',
        },
      ],
    });

    await expect(createService().getPublic('share-1')).resolves.toMatchObject({
      groups: [
        {
          question: '砌体工程量计算规则 总结一下这个文件，保留 [[9]]',
          answer: '结论\n\n保留普通 [1]。\n\n1. 第一项',
        },
      ],
    });
  });

  it('rejects selected answers that resolve to the same question', async () => {
    conversationRepo.findOne.mockResolvedValue({
      id: 'conversation-1',
      namespaceId: 'namespace-1',
      userId: 'user-1',
      title: 'Regenerated answer',
    });
    messageRepo.find.mockResolvedValue([
      message('question-1', null, 'user', 'Question'),
      message('answer-old', 'question-1', 'assistant', 'Old answer'),
      message('answer-new', 'question-1', 'assistant', 'Selected answer'),
    ]);

    await expect(
      createService().create('namespace-1', 'user-1', {
        channel: ConversationShareChannel.COPY_LINK,
        conversation_id: 'conversation-1',
        answer_ids: ['answer-old', 'answer-new'],
      }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it.each([
    ['en', 'en'],
    ['en-US', 'en'],
    ['zh-CN', 'zh-cn'],
  ])(
    'uses the request language %s in the share URL',
    async (language, locale) => {
      mockCompletedConversation();

      const result = await createService().create(
        'namespace-1',
        'user-1',
        {
          channel: ConversationShareChannel.COPY_LINK,
          conversation_id: 'conversation-1',
          group_ids: ['question-1'],
        },
        language,
      );

      expect(result.url).toBe(
        `https://test.omnibox.pro/${locale}/conversation-share/?share_id=share-1`,
      );
    },
  );

  it('localizes a configured conversation share URL', async () => {
    mockCompletedConversation();
    config.get.mockReturnValueOnce(
      'https://share.omnibox.pro/zh-cn/conversation-share/',
    );

    const result = await createService().create(
      'namespace-1',
      'user-1',
      {
        channel: ConversationShareChannel.COPY_LINK,
        conversation_id: 'conversation-1',
        group_ids: ['question-1'],
      },
      'en',
    );

    expect(result.url).toBe(
      'https://share.omnibox.pro/en/conversation-share/?share_id=share-1',
    );
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

  function mockCompletedConversation() {
    conversationRepo.findOne.mockResolvedValue({
      id: 'conversation-1',
      namespaceId: 'namespace-1',
      userId: 'user-1',
      title: 'A useful conversation',
    });
    messageRepo.find.mockResolvedValue([
      message('question-1', null, 'user', 'Question'),
      message('answer-1', 'question-1', 'assistant', 'Answer'),
    ]);
    shareRepo.save.mockImplementation((value) => ({
      ...value,
      id: 'share-1',
    }));
  }
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
