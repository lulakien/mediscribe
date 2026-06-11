import { useQuery } from '@tanstack/react-query';
import { Circle } from 'lucide-react';
import { cn } from '../lib/utils';
import { apiClient } from '../api/client';

interface BackendStatus {
  status: 'running' | 'starting' | 'error' | 'unknown';
  cuda_available: boolean;
  cuda_device?: string;
  default_model?: string;
}

export default function StatusFooter() {
  const { data: backendStatus } = useQuery<BackendStatus>({
    queryKey: ['backend-status'],
    queryFn: async () => {
      try {
        const response = await apiClient.get<{
          cuda_available?: boolean;
          cuda_device?: string;
          default_model?: string;
        }>('/health');
        return {
          status: 'running' as const,
          cuda_available: response.cuda_available ?? false,
          cuda_device: response.cuda_device,
          default_model: response.default_model,
        };
      } catch (error) {
        return {
          status: 'error' as const,
          cuda_available: false,
        };
      }
    },
    refetchInterval: 10000, // Poll every 10 seconds per DESIGN.md §9.4
    retry: false,
  });

  const status = backendStatus?.status || 'unknown';
  const cudaStatus = backendStatus?.cuda_available
    ? backendStatus.cuda_device
      ? `CUDA: ${backendStatus.cuda_device}`
      : 'CUDA: ready'
    : 'CPU only';
  const defaultModel = backendStatus?.default_model || 'large-v3';

  return (
    <footer className="flex h-9 items-center border-t border-border bg-surface-2 px-4 text-xs text-text-muted">
      <div className="flex items-center gap-4">
        {/* Local mode indicator */}
        <div className="flex items-center gap-1.5">
          <Circle className="h-2 w-2 fill-olive text-olive" />
          <span className="font-medium">Local mode</span>
        </div>

        {/* Separator */}
        <span className="text-border-strong">·</span>

        {/* Backend status */}
        <div className="flex items-center gap-1.5">
          <span>Backend:</span>
          <span
            className={cn(
              'font-medium',
              status === 'running' && 'text-success',
              status === 'starting' && 'text-warning',
              status === 'error' && 'text-error',
              status === 'unknown' && 'text-text-faint'
            )}
          >
            {status === 'running' && 'running'}
            {status === 'starting' && 'starting...'}
            {status === 'error' && 'error'}
            {status === 'unknown' && 'checking...'}
          </span>
        </div>

        {/* Separator */}
        <span className="text-border-strong">·</span>

        {/* CUDA status */}
        <div className="flex items-center gap-1.5">
          <span>{cudaStatus}</span>
        </div>

        {/* Separator */}
        <span className="text-border-strong">·</span>

        {/* Default model */}
        <div className="flex items-center gap-1.5">
          <span>Default model:</span>
          <span className="font-medium font-mono text-xs">{defaultModel}</span>
        </div>
      </div>
    </footer>
  );
}
