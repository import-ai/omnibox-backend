import { Injectable, Logger } from '@nestjs/common';
import { MinioService } from 'omniboxd/minio/minio.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChunkManagerService {
  private readonly logger = new Logger(ChunkManagerService.name);
  private readonly cleanupDelay: number;

  constructor(
    private readonly minioService: MinioService,
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
      await this.minioService.putChunkObject(chunkPath, buffer, buffer.length);
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
    const assembledPath = this.getAssembledPath(taskId);
    const chunkPaths = Array.from({ length: totalChunks }, (_, i) =>
      this.getChunkPath(taskId, i),
    );

    try {
      // Use MinIO's composeObject to merge all chunks
      await this.minioService.composeObject(assembledPath, chunkPaths);

      // Retrieve the assembled data
      const stream = await this.minioService.getObject(assembledPath);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          const assembledBuffer = Buffer.concat(chunks);
          const assembledData = assembledBuffer.toString('utf-8');
          resolve(assembledData);
        });
        stream.on('error', reject);
      });
    } catch (error) {
      this.logger.error(`Failed to assemble chunks for task ${taskId}:`, error);
      throw error;
    }
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

      // Add chunk paths
      for (let i = 0; i < totalChunks; i++) {
        objectsToRemove.push(this.getChunkPath(taskId, i));
      }

      // Add assembled path
      objectsToRemove.push(this.getAssembledPath(taskId));

      // Remove all objects
      await Promise.all(
        objectsToRemove.map((objectName) =>
          this.minioService.removeObject(objectName).catch((error) => {
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

  private getAssembledPath(taskId: string): string {
    return `wizard-chunks/${taskId}/assembled`;
  }
}
