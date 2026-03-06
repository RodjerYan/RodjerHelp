import React from 'react';

type Props = {
  file: File;
  previewUrl?: string | null;
  onRemove: () => void;
};

export default function AttachmentPreview({ file, previewUrl, onRemove }: Props) {
  const isImage = file.type.startsWith('image/');

  if (isImage && previewUrl) {
    return (
      <div className="mb-3 inline-flex relative">
        <img
          src={previewUrl}
          alt={file.name}
          className="w-28 h-28 object-cover rounded-xl border border-white/10"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500 text-white shadow"
          aria-label="Удалить файл"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 max-w-md">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{file.name}</div>
        <div className="text-xs opacity-70">{(file.size / 1024).toFixed(1)} KB</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="w-7 h-7 rounded-full bg-red-500 text-white shrink-0"
        aria-label="Удалить файл"
      >
        ×
      </button>
    </div>
  );
}
