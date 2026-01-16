import {
  Injectable,
  Logger,
  HttpStatus,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import archiver from 'archiver';
import { PassThrough } from 'stream';

import {
  ResourceExport,
  ExportStatus,
} from './entities/resource-export.entity';
import { S3Service } from 'omniboxd/s3/s3.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { ResourcesService } from 'omniboxd/resources/resources.service';
import {
  Resource,
  ResourceType,
} from 'omniboxd/resources/entities/resource.entity';
import { ExportJobDto } from './dto/export-job.dto';
import { ExportDownloadDto } from './dto/export-download.dto';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

const PAGE_SIZE = 50;
const EXPORT_URL_EXPIRY = 86400; // 24 hours in seconds
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const EXPORT_CANCELED_CODE = 'EXPORT_CANCELED';
const CANCEL_CHECK_INTERVAL_MS = 2000;

interface ResourceNode {
  resource: Resource;
  path: string;
  children: ResourceNode[];
}

interface AttachmentRef {
  objectName: string;
  filePath: string;
}

@Injectable()
export class ResourceExportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceExportsService.name);
  private cleanupInterval?: NodeJS.Timeout;
  private cleanupInProgress = false;

  constructor(
    @InjectRepository(ResourceExport)
    private readonly exportRepository: Repository<ResourceExport>,
    private readonly s3Service: S3Service,
    private readonly permissionsService: PermissionsService,
    private readonly resourcesService: ResourcesService,
    private readonly i18n: I18nService,
  ) {}

  onModuleInit(): void {
    const runCleanup = () => {
      this.runCleanup().catch((error) => {
        this.logger.warn('Failed to cleanup expired exports', error);
      });
    };
    runCleanup();
    this.cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  async createExportJob(
    namespaceId: string,
    resourceId: string,
    userId: string,
  ): Promise<ExportJobDto> {
    const hasPermission = await this.permissionsService.userHasPermission(
      namespaceId,
      resourceId,
      userId,
    );
    if (!hasPermission) {
      const message = this.i18n.t('auth.errors.notAuthorized');
      throw new AppException(message, 'NOT_AUTHORIZED', HttpStatus.FORBIDDEN);
    }

    const exportJob = this.exportRepository.create({
      namespaceId,
      userId,
      resourceId,
      status: ExportStatus.PENDING,
      totalResources: 0,
      processedResources: 0,
    });
    await this.exportRepository.save(exportJob);

    // Start processing asynchronously
    this.processExport(exportJob.id).catch((error) => {
      this.logger.error(`Failed to process export ${exportJob.id}`, error);
    });

    return ExportJobDto.fromEntity(exportJob);
  }

  async getExportJob(
    namespaceId: string,
    jobId: string,
    userId: string,
  ): Promise<ExportJobDto> {
    const job = await this.exportRepository.findOne({
      where: { id: jobId, namespaceId, userId },
    });
    if (!job) {
      const message = this.i18n.t('resource.errors.exportJobNotFound');
      throw new AppException(
        message,
        'EXPORT_JOB_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    return ExportJobDto.fromEntity(job);
  }

  async getDownloadUrl(
    namespaceId: string,
    jobId: string,
    userId: string,
  ): Promise<ExportDownloadDto> {
    const job = await this.exportRepository.findOne({
      where: { id: jobId, namespaceId, userId },
    });
    if (!job) {
      const message = this.i18n.t('resource.errors.exportJobNotFound');
      throw new AppException(
        message,
        'EXPORT_JOB_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }
    if (job.status !== ExportStatus.COMPLETED) {
      const message = this.i18n.t('resource.errors.exportNotCompleted');
      throw new AppException(
        message,
        'EXPORT_NOT_COMPLETED',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!job.s3Key) {
      const message = this.i18n.t('resource.errors.exportFileNotAvailable');
      throw new AppException(
        message,
        'EXPORT_FILE_NOT_AVAILABLE',
        HttpStatus.NOT_FOUND,
      );
    }
    if (job.expiresAt && job.expiresAt < new Date()) {
      const message = this.i18n.t('resource.errors.exportExpired');
      throw new AppException(message, 'EXPORT_EXPIRED', HttpStatus.GONE);
    }

    const expiresAt =
      job.expiresAt || new Date(Date.now() + EXPORT_URL_EXPIRY * 1000);
    const now = new Date();
    const expiresIn = Math.max(
      60,
      Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
    );
    const filename = await this.buildExportFileName(
      namespaceId,
      job.resourceId,
    );

    const url = await this.s3Service.generateDownloadUrl(
      job.s3Key,
      true,
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      expiresIn,
    );

    return ExportDownloadDto.create(url, expiresAt);
  }

  async cancelExportJob(
    namespaceId: string,
    jobId: string,
    userId: string,
  ): Promise<ExportJobDto> {
    const job = await this.exportRepository.findOne({
      where: { id: jobId, namespaceId, userId },
    });
    if (!job) {
      const message = this.i18n.t('resource.errors.exportJobNotFound');
      throw new AppException(
        message,
        'EXPORT_JOB_NOT_FOUND',
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      job.status === ExportStatus.COMPLETED ||
      job.status === ExportStatus.CANCELED ||
      job.status === ExportStatus.FAILED
    ) {
      return ExportJobDto.fromEntity(job);
    }

    job.status = ExportStatus.CANCELED;
    job.errorMessage = EXPORT_CANCELED_CODE;
    await this.exportRepository.save(job);
    return ExportJobDto.fromEntity(job);
  }

  private async processExport(jobId: string): Promise<void> {
    const job = await this.exportRepository.findOne({
      where: { id: jobId },
    });
    if (!job) {
      this.logger.error(`Export job ${jobId} not found`);
      return;
    }

    try {
      const updateResult = await this.exportRepository.update(
        { id: job.id, status: ExportStatus.PENDING },
        { status: ExportStatus.PROCESSING },
      );
      if (!updateResult.affected) {
        this.logger.log(`Export ${jobId} canceled before start`);
        return;
      }
      job.status = ExportStatus.PROCESSING;

      const s3Key = `exports/${job.namespaceId}/${job.id}.zip`;

      const resourceTree = await this.buildResourceTree(
        job.namespaceId,
        job.resourceId,
      );

      const totalResources = this.countTotalResources(resourceTree);
      job.totalResources = totalResources;
      await this.exportRepository.save(job);

      const checkCanceled = this.createCancelChecker(job.id);
      await this.uploadZipArchive(
        resourceTree,
        s3Key,
        (processedCount) => {
          job.processedResources = processedCount;
          if (processedCount % 10 === 0) {
            void this.exportRepository.save(job);
          }
        },
        checkCanceled,
      );

      job.status = ExportStatus.COMPLETED;
      job.s3Key = s3Key;
      job.completedAt = new Date();
      job.expiresAt = new Date(Date.now() + EXPORT_URL_EXPIRY * 1000);
      await this.exportRepository.save(job);

      this.logger.log(`Export ${jobId} completed successfully`);
    } catch (error) {
      if (this.isCanceledError(error)) {
        this.logger.log(`Export ${jobId} canceled`);
        job.status = ExportStatus.CANCELED;
        job.errorMessage = EXPORT_CANCELED_CODE;
      } else {
        this.logger.error(`Export ${jobId} failed`, error);
        job.status = ExportStatus.FAILED;
        job.errorMessage = error.message || 'Unknown error';
      }
      await this.exportRepository.save(job);
    }
  }

  private async buildResourceTree(
    namespaceId: string,
    resourceId: string,
  ): Promise<ResourceNode[]> {
    const root = await this.resourcesService.getResourceOrFail(
      namespaceId,
      resourceId,
    );
    const rootPath = this.sanitizeFileName(root.name);

    if (root.resourceType === ResourceType.FOLDER) {
      const children = await this.fetchResourceTree(
        namespaceId,
        resourceId,
        rootPath,
      );
      return [{ resource: root, path: rootPath, children }];
    }

    return [{ resource: root, path: rootPath, children: [] }];
  }

  private async fetchResourceTree(
    namespaceId: string,
    resourceId: string,
    currentPath: string,
  ): Promise<ResourceNode[]> {
    let offset = 0;
    const allChildren: Resource[] = [];
    let hasMore = true;

    while (hasMore) {
      const batch = await this.resourcesService.getChildren(
        namespaceId,
        [resourceId],
        { summary: true, limit: PAGE_SIZE, offset },
      );
      allChildren.push(...batch);
      hasMore = batch.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

    const nodes: ResourceNode[] = [];
    for (const child of allChildren) {
      const sanitizedName = this.sanitizeFileName(child.name);
      const nodePath = currentPath
        ? `${currentPath}/${sanitizedName}`
        : sanitizedName;

      if (child.resourceType === ResourceType.FOLDER && child.parentId) {
        const subChildren = await this.resourcesService.getChildren(
          namespaceId,
          [child.id],
          { summary: true, limit: 1 },
        );
        const hasChildren = subChildren.length > 0;

        if (hasChildren) {
          const subChildrenNodes = await this.fetchResourceTree(
            namespaceId,
            child.id,
            nodePath,
          );
          nodes.push({
            resource: child,
            path: nodePath,
            children: subChildrenNodes,
          });
        } else {
          nodes.push({ resource: child, path: nodePath, children: [] });
        }
      } else {
        nodes.push({ resource: child, path: nodePath, children: [] });
      }
    }

    return nodes;
  }

  private countTotalResources(nodes: ResourceNode[]): number {
    let count = 0;
    for (const node of nodes) {
      if (node.resource.resourceType !== ResourceType.FOLDER) {
        count += 1;
      }
      if (node.children.length > 0) {
        count += this.countTotalResources(node.children);
      }
    }
    return count;
  }

  private async uploadZipArchive(
    nodes: ResourceNode[],
    s3Key: string,
    onProgress: (count: number) => void,
    ensureActive?: () => Promise<void>,
  ): Promise<void> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const passThrough = new PassThrough();
    const uploadPromise = this.s3Service.putObject(
      s3Key,
      passThrough,
      'application/zip',
    );

    archive.on('error', (error) => {
      passThrough.destroy(error);
    });

    passThrough.on('error', () => {
      if (typeof archive.abort === 'function') {
        archive.abort();
      }
    });

    archive.pipe(passThrough);

    try {
      await this.processNodesForArchive(
        archive,
        nodes,
        onProgress,
        { value: 0 },
        ensureActive,
      );
      await archive.finalize();
      await uploadPromise;
    } catch (error) {
      passThrough.destroy(error as Error);
      try {
        await uploadPromise;
      } catch {
        // Swallow upload errors after cancellation/failure.
      }
      throw error;
    }
  }

  private async processNodesForArchive(
    archive: archiver.Archiver,
    nodes: ResourceNode[],
    onProgress: (count: number) => void,
    processedCount = { value: 0 },
    ensureActive?: () => Promise<void>,
  ): Promise<void> {
    for (const node of nodes) {
      if (ensureActive) {
        await ensureActive();
      }
      if (node.resource.resourceType === ResourceType.FOLDER) {
        const folderPath = node.path.endsWith('/')
          ? node.path
          : `${node.path}/`;
        if (folderPath.trim().length > 0) {
          archive.append('', { name: folderPath });
        }
        await this.processNodesForArchive(
          archive,
          node.children,
          onProgress,
          processedCount,
          ensureActive,
        );
      } else if (node.resource.resourceType === ResourceType.DOC) {
        const content = node.resource.content || '';
        const fileName = node.path.endsWith('.md')
          ? node.path
          : `${node.path}.md`;
        archive.append(content, { name: fileName });

        const attachmentRefs = this.extractAttachmentRefs(content);
        if (attachmentRefs.length > 0) {
          const attachmentsPath = fileName.endsWith('.md')
            ? `${fileName.slice(0, -3)}_attachments`
            : `${fileName}_attachments`;

          for (const attachment of attachmentRefs) {
            if (ensureActive) {
              await ensureActive();
            }
            try {
              const { stream } = await this.s3Service.getObject(
                `attachments/${attachment.objectName}`,
              );
              const safeFilePath = attachment.filePath || 'image';
              archive.append(stream, {
                name: `${attachmentsPath}/${safeFilePath}`,
              });
            } catch (error) {
              this.logger.warn(
                `Failed to fetch attachment: ${attachment.objectName}`,
                error,
              );
            }
          }
        }

        processedCount.value += 1;
        onProgress(processedCount.value);
      } else if (
        node.resource.resourceType === ResourceType.FILE ||
        node.resource.resourceType === ResourceType.LINK
      ) {
        const content = this.generateFileContent(node.resource);
        archive.append(content, { name: node.path });
        processedCount.value += 1;
        onProgress(processedCount.value);
      }
    }
  }

  private generateFileContent(resource: Resource): string {
    if (resource.resourceType === ResourceType.LINK) {
      const url = resource.attrs?.url || resource.content || '';
      return `# ${resource.name}\n\nURL: ${url}`;
    }
    if (resource.resourceType === ResourceType.FILE) {
      return `# ${resource.name}\n\nThis is a file resource.\n\nFile ID: ${resource.fileId || 'N/A'}`;
    }
    return '';
  }

  private sanitizeFileName(name: string): string {
    const sanitized = (name || 'untitled')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    if (!sanitized || sanitized === '.' || sanitized === '..') {
      return 'untitled';
    }
    return sanitized;
  }

  private async buildExportFileName(
    namespaceId: string,
    resourceId: string,
  ): Promise<string> {
    const resource = await this.resourcesService.getResourceMeta(
      namespaceId,
      resourceId,
    );
    const baseName = this.sanitizeFileName(
      resource?.name || resourceId || 'export',
    );
    if (baseName.endsWith('.zip')) {
      return baseName;
    }
    return `${baseName}.zip`;
  }

  private sanitizeAttachmentPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    const safeSegments = segments
      .map((segment) =>
        segment
          .replace(/[<>:"/\\|?*]/g, '_')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(
        (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
      );
    return safeSegments.join('/');
  }

  private normalizeAttachmentRef(rawUrl: string): AttachmentRef | null {
    if (!rawUrl) {
      return null;
    }
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.startsWith('data:')) {
      return null;
    }

    const withoutQuery = trimmed.split(/[?#]/)[0];
    if (!withoutQuery) {
      return null;
    }

    let path = withoutQuery;
    try {
      path = new URL(withoutQuery, 'http://localhost').pathname;
    } catch {
      path = withoutQuery;
    }

    const normalizedPath = path.replace(/\\/g, '/');
    let objectName: string | null = null;

    const apiMatch = normalizedPath.match(
      /\/api\/v1\/attachments\/(?:images|media)\/(.+)$/i,
    );
    if (apiMatch?.[1]) {
      objectName = apiMatch[1];
    } else {
      const directMatch = normalizedPath.match(/(?:^|\/)attachments\/(.+)$/i);
      if (directMatch?.[1]) {
        objectName = directMatch[1];
      }
    }

    if (!objectName) {
      return null;
    }
    objectName = objectName.replace(/^\/+/, '').trim();
    if (!objectName) {
      return null;
    }

    const filePath = this.sanitizeAttachmentPath(objectName);
    return {
      objectName,
      filePath: filePath || 'image',
    };
  }

  private extractAttachmentRefs(content: string): AttachmentRef[] {
    const urls: string[] = [];

    const markdownImageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    let match;
    while ((match = markdownImageRegex.exec(content)) !== null) {
      urls.push(match[1]);
    }

    const htmlImgQuotedRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((match = htmlImgQuotedRegex.exec(content)) !== null) {
      urls.push(match[1]);
    }

    const refs: AttachmentRef[] = [];
    const seen = new Set<string>();
    for (const url of urls) {
      const ref = this.normalizeAttachmentRef(url);
      if (!ref || seen.has(ref.objectName)) {
        continue;
      }
      seen.add(ref.objectName);
      refs.push(ref);
    }

    return refs;
  }

  async cleanupExpiredExports(): Promise<void> {
    const now = new Date();
    const expiredJobs = await this.exportRepository.find({
      where: {
        status: ExportStatus.COMPLETED,
        expiresAt: LessThan(now),
      },
    });

    for (const job of expiredJobs) {
      if (job.s3Key) {
        try {
          await this.s3Service.deleteObject(job.s3Key);
        } catch (error) {
          this.logger.warn(`Failed to delete S3 object: ${job.s3Key}`, error);
        }
      }
      await this.exportRepository.remove(job);
    }

    this.logger.log(`Cleaned up ${expiredJobs.length} expired exports`);
  }

  private async runCleanup(): Promise<void> {
    if (this.cleanupInProgress) {
      return;
    }
    this.cleanupInProgress = true;
    try {
      await this.cleanupExpiredExports();
    } finally {
      this.cleanupInProgress = false;
    }
  }

  private createCancelChecker(jobId: string): () => Promise<void> {
    let lastCheck = 0;
    return async () => {
      const now = Date.now();
      if (now - lastCheck < CANCEL_CHECK_INTERVAL_MS) {
        return;
      }
      lastCheck = now;
      const latestJob = await this.exportRepository.findOne({
        select: ['id', 'status'],
        where: { id: jobId },
      });
      if (!latestJob || latestJob.status === ExportStatus.CANCELED) {
        throw new Error(EXPORT_CANCELED_CODE);
      }
    };
  }

  private isCanceledError(error: unknown): boolean {
    return error instanceof Error && error.message === EXPORT_CANCELED_CODE;
  }
}
