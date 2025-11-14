import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from 'omniboxd/s3/s3.service';
import { ConfigService } from '@nestjs/config';
import { buffer } from 'node:stream/consumers';

@Injectable()
export class ChunkManagerService {
  private readonly logger = new Logger(ChunkManagerService.name);
  private readonly cleanupDelay: number;

  constructor(
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
  ) {
    this.cleanupDelay =
      parseInt(this.configService.get('OBB_CHUNK_CLEANUP_DELAY', '60'), 10) *
      1000; // Convert to milliseconds
  }

  async storeChunk(
    taskId: string,
    chunkIndex: number,
    totalChunks: number,
    data: string,
  ): Promise<void> {
    const chunkPath = this.getChunkPath(taskId, chunkIndex);
    const buffer = Buffer.from(data, 'base64');

    try {
      await this.s3Service.putObject(chunkPath, buffer);
      this.logger.debug(
        `Stored chunk ${chunkIndex + 1}/${totalChunks} for task ${taskId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to store chunk ${chunkIndex} for task ${taskId}:`,
        error,
      );
      throw error;
    }
  }

  async assembleChunks(taskId: string, totalChunks: number): Promise<string> {
    const buffers: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = this.getChunkPath(taskId, i);
      const { stream } = await this.s3Service.getObject(chunkPath);
      buffers.push(await buffer(stream));
    }
    return Buffer.concat(buffers).toString('utf-8');
  }

  cleanupChunks(taskId: string, totalChunks: number): void {
    // Schedule cleanup after delay to allow for any final processing
    setTimeout(() => {
      this.performCleanup(taskId, totalChunks).catch((error) => {
        this.logger.error(
          `Failed to cleanup chunks for task ${taskId}:`,
          error,
        );
      });
    }, this.cleanupDelay);
  }

  private async performCleanup(
    taskId: string,
    totalChunks: number,
  ): Promise<void> {
    try {
      const objectsToRemove: string[] = [];

      for (let i = 0; i < totalChunks; i++) {
        objectsToRemove.push(this.getChunkPath(taskId, i));
      }

      await Promise.all(
        objectsToRemove.map((objectName) =>
          this.s3Service.deleteObject(objectName).catch((error) => {
            this.logger.warn(`Failed to remove object ${objectName}:`, error);
          }),
        ),
      );

      this.logger.debug(`Cleaned up chunks for task ${taskId}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup chunks for task ${taskId}:`, error);
    }
  }

  private getChunkPath(taskId: string, chunkIndex: number): string {
    return `wizard-chunks/${taskId}/chunk-${chunkIndex.toString().padStart(6, '0')}`;
  }
}
