import { useCallback, useRef, useState } from 'react';

export default function Dropzone({ id, label, accept = '.csv', file, onFileSelected, helper }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleSelect = useCallback((e) => {
    const f = e.target.files?.[0];
    if (f) onFileSelected(f);
  }, [onFileSelected]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    const csv = files.find((f) => f.name.toLowerCase().endsWith('.csv')) || files[0];
    if (csv) onFileSelected(csv);
  }, [onFileSelected]);

  const onDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragOver(true);
    if (e.type === 'dragleave') setDragOver(false);
  }, []);

  const openFile = useCallback(() => inputRef.current?.click(), []);

  return (
    <div className="group">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-200">
        {label}
      </label>

      <div
        role="button"
        tabIndex={0}
        onClick={openFile}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openFile()}
        onDrop={onDrop}
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        className={`mt-2 rounded-md border-2 border-dashed p-4 transition ${
          dragOver
            ? 'border-indigo-500 bg-indigo-50/50 dark:border-indigo-400 dark:bg-indigo-950/30'
            : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/30 dark:border-gray-700 dark:hover:border-indigo-400 dark:hover:bg-indigo-950/10'
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          onChange={handleSelect}
          className="sr-only"
        />
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-300">
          <svg viewBox="0 0 24 24" width="20" height="20" className="text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 0 0 4 4h10a4 4 0 0 0 1-7.874V11a6 6 0 1 0-12 0v.126A4.002 4.002 0 0 0 3 15Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v6m0-6 2.5 2.5M12 12l-2.5 2.5" />
          </svg>
          <span>
            Drag & drop CSV here or <span className="font-medium text-indigo-600 underline-offset-2 group-hover:underline dark:text-indigo-400">browse</span>
          </span>
        </div>
        {helper && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper}</p>}
        {file && <p className="mt-2 text-xs text-gray-700 dark:text-gray-300">Selected: {file.name}</p>}
      </div>
    </div>
  );
}
