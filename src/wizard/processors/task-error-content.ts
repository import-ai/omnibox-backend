import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { isEmpty } from 'omniboxd/utils/is-empty';

import { QuotaExceptionDetailsDto } from './dto/quota-exception.dto';

function getResourceLabel(usageType: string): string {
  switch (usageType) {
    case 'video':
      return '视频';
    case 'audio':
      return '音频';
    case 'pdf':
      return 'PDF';
    case 'image':
      return '图片';
    default:
      return '文件';
  }
}

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return '0秒';
  }
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;

  if (minutes === 0) {
    return `${remain}秒`;
  }

  return `${minutes} 分钟 ${remain} 秒`;
}

export function buildTaskErrorContent(task: Task): string {
  const exceptionType = (task.exception as any)?.type;
  const exceptionCode = (task.exception as any)?.code;
  const exceptionError = (task.exception as any)?.error;
  const rawDetails = (task.exception as any)?.details;

  if (
    ['FILE_CONTENT_TOO_LONG', 'SUCCESS_WITH_NO_VALID_FRAGMENT'].includes(
      exceptionCode,
    ) &&
    exceptionError
  ) {
    return exceptionError;
  }

  if (exceptionType === 'InsufficientQuotaError' && rawDetails) {
    const details = plainToInstance(QuotaExceptionDetailsDto, rawDetails, {
      enableImplicitConversion: true,
      excludeExtraneousValues: true,
    });
    const errors = validateSync(details, { whitelist: true });
    if (errors.length > 0) {
      return 'error';
    }

    const resourceLabel = getResourceLabel(details.usageType);
    const isPageType =
      details.usageType === 'pdf' || details.usageType === 'image';
    const valueLabel = isPageType ? '页数' : '时长';

    const requestedStr = isPageType
      ? `${details.requestedAmount}页`
      : formatDuration(details.requestedAmount);
    const limitStr = isPageType
      ? `${details.limitAmount}页`
      : formatDuration(details.limitAmount);
    const remainingStr = isPageType
      ? `${details.remainingAmount}页`
      : formatDuration(details.remainingAmount);

    if (
      details.code === 'DOC_PARSE_LIMIT_EXCEEDED' ||
      details.code === 'VIDEO_AUDIO_PARSE_LIMIT_EXCEEDED'
    ) {
      return `当前 ${resourceLabel} 的${valueLabel}为 ${requestedStr}，超出单次解析的上限：${limitStr}`;
    }

    if (details.code === 'INSUFFICIENT_QUOTA') {
      return `当前 ${resourceLabel} 的${valueLabel}为 ${requestedStr}，当前剩余额度为：${remainingStr}`;
    }
  }

  if (
    typeof exceptionError === 'string' &&
    (exceptionError.includes('Cannot extract Ximalaya audio_id from URL') ||
      exceptionError.includes(
        'This content requires VIP access and is not currently supported.',
      ))
  ) {
    return '该链接内容暂不支持读取。';
  }

  return 'error';
}

/**
 * Whether `content` is exactly the placeholder a failed task wrote into the
 * resource. Only such content may be discarded on retry: anything else is
 * either real parsed content or a user edit.
 */
export function isTaskErrorContent(content: string, tasks: Task[]): boolean {
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }
  return tasks.some(
    (task) =>
      task.exception &&
      !isEmpty(task.exception) &&
      buildTaskErrorContent(task).trim() === trimmed,
  );
}
