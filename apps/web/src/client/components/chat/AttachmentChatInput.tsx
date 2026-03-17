import React, { useEffect, useMemo, useRef, useState } from 'react';
import AttachmentPreview from './AttachmentPreview';
import { sendChatMessage } from '../../api/chatApi';

type Props = {
  apiBaseUrl: string;
  onSent?: () => void;
};

export default function AttachmentChatInput({ apiBaseUrl, onSent }: Props) {
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewUrl = useMemo(() => {
    if (!file || !file.type.startsWith('image/')) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!message.trim() && !file) return;

    try {
      setIsSending(true);
      await sendChatMessage(apiBaseUrl, message, file);
      setMessage('');
      handleRemoveFile();
      onSent?.();
    } catch (error) {
      console.error('Ошибка отправки сообщения:', error);
      alert('Не удалось отправить сообщение');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="border-t border-white/10 bg-black/20 p-3">
      {file && (
        <AttachmentPreview file={file} previewUrl={previewUrl} onRemove={handleRemoveFile} />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePickFile}
          className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-lg"
          aria-label="Прикрепить файл"
          title="Прикрепить файл"
        >
          📎
        </button>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.xls"
          onChange={handleFileChange}
        />

        <input
          className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 outline-none"
          placeholder="Введите сообщение..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isSending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />

        <button
          type="button"
          onClick={() => void handleSend()}
          className="h-10 rounded-xl bg-blue-600 px-4 text-white disabled:opacity-50"
          disabled={isSending}
        >
          {isSending ? '...' : 'Отправить'}
        </button>
      </div>
    </div>
  );
}
