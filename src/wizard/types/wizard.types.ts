export interface Image {
  name?: string;
  link: string;
  data: string; // base64 encoded string
  mimetype: string;
}

export interface ProcessedImage {
  originalLink: string;
  attachmentId: string;
  name?: string;
  mimetype: string;
}
