import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { extractApiError } from '@/lib/api';
import { useUploadResume } from '../hooks';
import { formatFileSize, validateResumeFile } from '../resumesApi';

export interface ResumeUploadProps {
  onSuccess?: () => void;
}

export const ResumeUpload: React.FC<ResumeUploadProps> = ({ onSuccess }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const uploadMutation = useUploadResume();

  const handleFileSelection = (file: File | null) => {
    setValidationError(null);
    setSuccessMessage(null);
    setUploadProgress(0);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validation = validateResumeFile(file);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid file selected');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploadMutation.isPending) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploadMutation.isPending) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelection(file);
    }
  };

  const handleClearSelection = () => {
    setSelectedFile(null);
    setValidationError(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || uploadMutation.isPending) return;

    const validation = validateResumeFile(selectedFile);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid file');
      return;
    }

    setValidationError(null);
    setSuccessMessage(null);
    setUploadProgress(0);

    uploadMutation.mutate(
      {
        file: selectedFile,
        onProgress: (percent) => setUploadProgress(percent),
      },
      {
        onSuccess: (data) => {
          setSuccessMessage(
            data.message ||
              'Resume uploaded successfully! It is now your active primary resume.'
          );
          setSelectedFile(null);
          setUploadProgress(100);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          if (onSuccess) {
            onSuccess();
          }
        },
        onError: (err) => {
          const apiErr = extractApiError(err);
          setValidationError(apiErr.message);
          setUploadProgress(0);
        },
      }
    );
  };

  return (
    <Card glass className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <UploadCloud className="h-5 w-5 text-primary" />
          <span>Upload New Resume</span>
        </CardTitle>
        <CardDescription>
          Upload a PDF resume to attach to job applications. Your newest
          uploaded resume automatically becomes your active primary resume.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Hidden Native File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          disabled={uploadMutation.isPending}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileSelection(e.target.files[0]);
            }
          }}
        />

        {/* Drag and Drop Zone */}
        {!selectedFile ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => {
              if (!uploadMutation.isPending) {
                fileInputRef.current?.click();
              }
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-primary bg-primary/10 scale-[0.99]'
                : 'border-border/70 hover:border-primary/60 hover:bg-secondary/20'
            } ${uploadMutation.isPending ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <UploadCloud className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                <span className="text-primary hover:underline">
                  Click to browse
                </span>{' '}
                or drag and drop your PDF here
              </p>
              <p className="text-xs text-muted-foreground">
                Format: <strong className="text-foreground">PDF only</strong>{' '}
                (max 5MB)
              </p>
            </div>
          </div>
        ) : (
          /* Selected File Stage */
          <div className="rounded-xl border border-border/80 bg-secondary/30 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)} • Ready to upload
                  </p>
                </div>
              </div>

              {!uploadMutation.isPending && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  title="Remove selected file"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Upload Progress Bar */}
            {uploadMutation.isPending && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Uploading to CareerForge...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearSelection}
                disabled={uploadMutation.isPending}
              >
                Change File
              </Button>
              <Button
                size="sm"
                onClick={handleUploadSubmit}
                disabled={uploadMutation.isPending}
                className="gap-2"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    <span>Upload Resume</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Validation or API Error Alert */}
        {validationError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Upload Notice: </span>
              {validationError}
            </div>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Success: </span>
              {successMessage}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
