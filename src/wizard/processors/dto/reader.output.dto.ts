import { ProcessedImage } from 'omniboxd/wizard/types/wizard.types';
import { Record } from 'openai/core';

export interface ReaderOutputDto {
  title: string;
  markdown: string;
  images?: ProcessedImage[];
  metadata?: Record<string, any>;
}
