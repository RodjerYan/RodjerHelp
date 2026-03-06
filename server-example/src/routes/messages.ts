import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'node:fs';
import * as path from 'node:path';

const router = Router();

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^\w.\-а-яА-Я]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

type ChatMessage = {
  id: number;
  text: string;
  createdAt: string;
  attachment?: {
    originalName: string;
    filename: string;
    mimetype: string;
    size: number;
    url: string;
  };
};

const messages: ChatMessage[] = [];

router.post('/api/messages', upload.single('attachment'), (req: Request, res: Response) => {
  const text = typeof req.body.message === 'string' ? req.body.message : '';

  const message: ChatMessage = {
    id: Date.now(),
    text,
    createdAt: new Date().toISOString(),
  };

  if (req.file) {
    message.attachment = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`,
    };
  }

  messages.push(message);

  return res.status(201).json({
    success: true,
    message,
  });
});

router.get('/api/messages', (_req: Request, res: Response) => {
  return res.json({ success: true, messages });
});

export default router;
