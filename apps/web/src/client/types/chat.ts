export type AttachmentMeta = {
  originalName: string;
  filename: string;
  mimetype: string;
  size: number;
  url: string;
};

export type ChatMessage = {
  id: number;
  text: string;
  createdAt: string;
  attachment?: AttachmentMeta;
};
