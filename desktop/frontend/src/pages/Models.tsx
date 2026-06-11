import { useState } from 'react';
import { Copy, Download, Trash2, HardDrive, RefreshCw, Loader2, MoreVertical } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useModels, useDownloadModel, useDeleteModel, useUpdateSettings, useSettings } from '@/api/hooks';
import { apiClient } from '@/api/client';
import { useWebSocket } from '@/api/websocket';
import { cn } from '@/lib/utils';
import type { Model } from '@/types';
import { useQuery } from '@tanstack/react-query';

// Model catalog with metadata
const MODEL_CATALOG = [
  {
    id: 'large-v3',
    name: 'large-v3',
    description: 'Best quality. The recommended model for lectures.',
    size: '~3.1 GB',
    quality: 4,
    speed: 2,
  },
  {
    id: 'large-v3-turbo',
    name: 'large-v3-turbo',
    description: 'Nearly as accurate, noticeably faster.',
    size: '~1.6 GB',
    quality: 4,
    speed: 4,
  },
  {
    id: 'medium',
    name: 'medium',
    description: 'Lighter fallback when VRAM is tight.',
    size: '~1.5 GB',
    quality: 3,
    speed: 3,
  },
  {
    id: 'small',
    name: 'small',
    description: 'Fast fallback for quick drafts.',
    size: '~0.5 GB',
    quality: 2,
    speed: 5,
  },
];

interface ModelCardProps {
  model: typeof MODEL_CATALOG[0];
  modelData?: Model;
  isDefault: boolean;
  onDownload: () => void;
  onTest: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  downloadProgress?: number;
  isDownloading: boolean;
  isTesting: boolean;
}

function ModelCard({
  model,
  modelData,
  isDefault,
  onDownload,
  onTest,
  onSetDefault,
  onDelete,
  downloadProgress,
  isDownloading,
  isTesting,
}: ModelCardProps) {
  const isInstalled = modelData?.loaded || false;
  const getStatusBadge = () => {
    if (isDownloading) {
      return <Badge variant="downloading" pulse>Downloading</Badge>;
    }
    if (modelData?.download_progress !== undefined && modelData.download_progress < 100) {
      return <Badge variant="downloading" pulse>Downloading</Badge>;
    }
    if (isTesting) {
      return <Badge variant="running" pulse>Testing on CUDA</Badge>;
    }
    if (isInstalled) {
      return <Badge variant="installed">Installed</Badge>;
    }
    return <Badge variant="not-installed">Not installed</Badge>;
  };

  const renderQualityDots = (quality: number) => {
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              i < quality ? 'bg-primary' : 'bg-border'
            )}
          />
        ))}
      </div>
    );
  };

  return (
    <Card className="flex flex-col min-h-[280px]">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div className="space-y-1 flex-1">
          <CardTitle className="text-h3">{model.name}</CardTitle>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {isDefault && (
              <Badge variant="completed" className="bg-primary-soft text-primary">
                Default
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <CardDescription className="text-body leading-relaxed">
          {model.description}
        </CardDescription>

        <div className="flex items-center gap-4 text-small text-text-muted">
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-4 h-4" />
            <span className="font-mono">{model.size}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Quality</span>
            {renderQualityDots(model.quality)}
          </div>
        </div>

        {isDownloading && (
          <div className="space-y-2">
            <Progress
              value={downloadProgress || 0}
              max={100}
              showPercent
              indeterminate={!downloadProgress}
            />
            {modelData?.local_path && (
              <p className="text-small text-text-muted font-mono">
                {modelData.local_path}
              </p>
            )}
          </div>
        )}

        {isTesting && (
          <div className="flex items-center gap-2 text-small text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading model onto CUDA...</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2 pt-4">
        {!isInstalled && !isDownloading && (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onDownload}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        )}

        {isInstalled && !isDownloading && (
          <>
            <Button
              variant="secondary"
              size="default"
              onClick={onTest}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test on CUDA'
              )}
            </Button>

            {!isDefault && (
              <Button
                variant="ghost"
                size="default"
                onClick={onSetDefault}
              >
                Set as default
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-error focus:text-error"
                  onClick={onDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete model...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelName: string;
  modelSize: string;
  onConfirm: () => void;
  isDeleting: boolean;
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  modelName,
  modelSize,
  onConfirm,
  isDeleting,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {modelName}?</DialogTitle>
          <DialogDescription>
            This will remove the model from your local cache and free up approximately{' '}
            <span className="font-mono">{modelSize}</span> of disk space.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger-filled"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete model'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ModelsPage() {
  const { data: models = [], isLoading: isLoadingModels, refetch } = useModels();
  const { data: settings } = useSettings();
  const downloadModel = useDownloadModel();
  const deleteModel = useDeleteModel();
  const updateSettings = useUpdateSettings();
  const { data: cacheInfo, refetch: refetchCache } = useQuery({
    queryKey: ['models', 'cache', 'info'],
    queryFn: () => apiClient.get<{ cache_path?: string; readable_size?: string; error?: string }>('/models/cache/info'),
    staleTime: 30000,
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<typeof MODEL_CATALOG[0] | null>(null);
  const [testingModels, setTestingModels] = useState<Set<string>>(new Set());
  const cacheSize = cacheInfo?.readable_size || '—';
  const cachePath = cacheInfo?.cache_path || '';

  // Listen to WebSocket events for download progress
  useWebSocket((event) => {
    if (event.type === 'download_progress' || event.type === 'model_update') {
      refetch();
    }
  });

  const handleDownload = async (modelId: string) => {
    try {
      await downloadModel.mutateAsync(modelId);
    } catch (error) {
      console.error('Failed to download model:', error);
    }
  };

  const handleTest = async (modelId: string) => {
    setTestingModels((prev) => new Set(prev).add(modelId));
    try {
      await apiClient.post(`/models/${modelId}/test`, {
        device: 'cuda',
        compute_type: 'float16',
      });
      await refetch();
    } catch (error) {
      console.error('Failed to test model:', error);
    } finally {
      setTestingModels((prev) => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  };

  const handleSetDefault = async (modelId: string) => {
    try {
      await updateSettings.mutateAsync({
        defaultModel: modelId,
      });
    } catch (error) {
      console.error('Failed to set default model:', error);
    }
  };

  const handleDeleteClick = (model: typeof MODEL_CATALOG[0]) => {
    setModelToDelete(model);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!modelToDelete) return;

    try {
      await deleteModel.mutateAsync(modelToDelete.id);
      setDeleteDialogOpen(false);
      setModelToDelete(null);
    } catch (error) {
      console.error('Failed to delete model:', error);
    }
  };

  const handleRefreshCache = async () => {
    await refetch();
    await refetchCache();
  };

  const handleCopyPath = async () => {
    if (!cachePath) return;
    try {
      await navigator.clipboard.writeText(cachePath);
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  };

  // Separate installed and available models
  const installedModels = MODEL_CATALOG.filter((model) =>
    models.some((m) => m.id === model.id && m.loaded)
  );
  const availableModels = MODEL_CATALOG.filter(
    (model) => !models.some((m) => m.id === model.id && m.loaded)
  );

  return (
    <div className="container mx-auto max-w-[1200px] py-8 px-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-h1 font-display font-semibold">Models</h1>
        <p className="text-body text-text-muted">
          Everything runs on your machine — no account, no API keys.
        </p>
      </div>

      {/* Cache Summary Strip */}
      <Card variant="soft" className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 text-small text-text-muted">
              <span className="font-medium">Local cache:</span>
              <code className="font-mono text-text px-2 py-1 bg-surface rounded text-small truncate">
                {cachePath}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyPath}
                className="flex-shrink-0"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-small">
              <span className="text-text-muted">Total size:</span>
              <span className="font-mono text-text">{cacheSize}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="compact"
            onClick={handleRefreshCache}
            disabled={isLoadingModels}
          >
            <RefreshCw className={cn('w-4 h-4 mr-2', isLoadingModels && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Loading State */}
      {isLoadingModels && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-text-muted" />
        </div>
      )}

      {/* Installed Models Section */}
      {!isLoadingModels && installedModels.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-h2 font-display font-semibold">Installed</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {installedModels.map((model) => {
              const modelData = models.find((m) => m.id === model.id);
              return (
                <ModelCard
                  key={model.id}
                  model={model}
                  modelData={modelData}
                  isDefault={settings?.defaultModel === model.id}
                  onDownload={() => handleDownload(model.id)}
                  onTest={() => handleTest(model.id)}
                  onSetDefault={() => handleSetDefault(model.id)}
                  onDelete={() => handleDeleteClick(model)}
                  isDownloading={false}
                  isTesting={testingModels.has(model.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Available Models Section */}
      {!isLoadingModels && availableModels.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-h2 font-display font-semibold">Available</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {availableModels.map((model) => {
              const modelData = models.find((m) => m.id === model.id);
              const isDownloading =
                downloadModel.isPending ||
                (modelData?.download_progress !== undefined &&
                  modelData.download_progress < 100);

              return (
                <ModelCard
                  key={model.id}
                  model={model}
                  modelData={modelData}
                  isDefault={false}
                  onDownload={() => handleDownload(model.id)}
                  onTest={() => handleTest(model.id)}
                  onSetDefault={() => handleSetDefault(model.id)}
                  onDelete={() => handleDeleteClick(model)}
                  downloadProgress={modelData?.download_progress}
                  isDownloading={isDownloading}
                  isTesting={false}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        modelName={modelToDelete?.name || ''}
        modelSize={modelToDelete?.size || ''}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteModel.isPending}
      />
    </div>
  );
}
