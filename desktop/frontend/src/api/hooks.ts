// TanStack Query hooks for API operations

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query';
import { apiClient } from './client';
import { useWebSocket } from './websocket';
import type {
  Job,
  Model,
  ProgressEvent,
  RunMetrics,
  TranscriptionResult,
  TranscriptionOptions,
  Config,
} from '../types';

interface BackendModelState {
  model_info: {
    id: string;
    name: string;
    description: string;
    approximate_size_gb: number;
    backend?: 'faster-whisper' | 'mlx';
  };
  status: string;
  download_progress?: {
    percent?: number;
  } | null;
  size_on_disk_bytes?: number | null;
}

interface BackendJob {
  id: string;
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  file_paths: string[];
  output_folder: string;
  current_file?: string | null;
  status_rows?: Array<Record<string, unknown>>;
  error_message?: string;
  normalize_audio?: boolean;
  overwrite?: boolean;
  dry_run?: boolean;
  cancel_requested?: boolean;
  last_progress_event?: {
    message?: string;
    current_file?: string;
    status_rows?: Array<Record<string, unknown>>;
    metrics?: RunMetrics;
    model_status?: string;
    log_tail?: string;
    progress?: number;
    state?: string;
    cancel_requested?: boolean;
  } | null;
  options: TranscriptionOptions & {
    model_name?: string;
    model_id?: string;
  };
}

const toModel = (state: BackendModelState): Model => ({
  id: state.model_info.id,
  name: state.model_info.name,
  description: state.model_info.description,
  size: state.size_on_disk_bytes
    ? `${(state.size_on_disk_bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : `~${state.model_info.approximate_size_gb} GB`,
  loaded:
    state.status === 'installed' ||
    state.status === 'ready_on_cuda' ||
    state.status === 'ready_on_mlx',
  backend: state.model_info.backend,
  download_progress: state.download_progress?.percent,
});

const toJob = (job: BackendJob): Job => {
  const status =
    job.state === 'queued'
      ? 'pending'
      : job.state === 'running'
      ? 'processing'
      : job.state;
  const outputRow = job.status_rows?.find((row) => String(row.status) === 'completed');
  const outputFile = typeof outputRow?.output_txt_path === 'string'
    ? outputRow.output_txt_path
    : undefined;

  return {
    id: job.id,
    status,
    // Backend ProgressEvent.progress is normalized 0-1; UI components consume 0-100.
    progress: Math.max(0, Math.min(100, job.progress * 100)),
    created_at: job.created_at,
    updated_at: job.finished_at || job.started_at || job.created_at,
    input_files: job.file_paths,
    output_folder: job.output_folder,
    output_file: outputFile,
    error: job.error_message || undefined,
    model_id: job.options.model_name || job.options.model_id || 'large-v3',
    options: job.options,
    current_file: job.current_file || undefined,
    status_rows: job.status_rows,
    cancel_requested: job.cancel_requested,
    metrics: job.last_progress_event?.metrics,
    last_progress_event: job.last_progress_event || undefined,
  };
};

// Query Keys
export const queryKeys = {
  jobs: ['jobs'] as const,
  job: (id: string) => ['jobs', id] as const,
  models: ['models'] as const,
  model: (id: string) => ['models', id] as const,
  settings: ['settings'] as const,
  openrouterKey: ['settings', 'openrouter-key'] as const,
  result: (jobId: string) => ['results', jobId] as const,
  backendStatus: ['backend-status'] as const,
  logs: ['logs'] as const,
};

function eventJob(event: ProgressEvent): BackendJob | null {
  const job = event.payload?.job;
  if (job && typeof job === 'object' && 'id' in job) {
    return job as BackendJob;
  }
  return null;
}

export function useLiveBackendEvents(): void {
  const queryClient = useQueryClient();

  const handleEvent = useCallback((event: ProgressEvent) => {
    if (event.type === 'job_progress' || event.type === 'job_state' || event.type === 'job_stop_requested' || event.type === 'job_created') {
      const backendJob = eventJob(event);
      if (backendJob) {
        const mappedJob = toJob(backendJob);
        queryClient.setQueryData(queryKeys.job(mappedJob.id), mappedJob);
        queryClient.setQueryData<Job[]>(queryKeys.jobs, (current) => {
          if (!current) return [mappedJob];
          const exists = current.some((job) => job.id === mappedJob.id);
          return exists
            ? current.map((job) => (job.id === mappedJob.id ? mappedJob : job))
            : [mappedJob, ...current];
        });
      }

      if (event.type !== 'job_progress') {
        queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      }
      if (event.job_id) {
        if (event.type !== 'job_progress') {
          queryClient.invalidateQueries({ queryKey: queryKeys.job(event.job_id) });
        }
        const state = String(event.payload?.state || backendJob?.state || '');
        if (['completed', 'failed', 'cancelled'].includes(state)) {
          queryClient.invalidateQueries({ queryKey: queryKeys.result(event.job_id) });
          queryClient.invalidateQueries({ queryKey: queryKeys.logs });
        }
      }
    }

    if (event.type === 'model_download') {
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
    }

    if (event.type === 'backend_status') {
      queryClient.setQueryData(queryKeys.backendStatus, event.payload);
    }
  }, [queryClient]);

  useWebSocket(handleEvent);
}

// Jobs Hooks
export function useJobs(): UseQueryResult<Job[]> {
  return useQuery({
    queryKey: queryKeys.jobs,
    queryFn: async () => {
      const response = await apiClient.get<{ jobs: BackendJob[] }>('/jobs');
      return response.jobs.map(toJob);
    },
    refetchInterval: 30000, // WebSocket drives live updates; polling is fallback only.
  });
}

export function useJob(jobId: string): UseQueryResult<Job> {
  return useQuery({
    queryKey: queryKeys.job(jobId),
    queryFn: async () => toJob(await apiClient.get<BackendJob>(`/jobs/${jobId}`)),
    enabled: !!jobId,
    refetchInterval: (query) => {
      // Poll while job is active
      if (query.state.data?.status === 'pending' || query.state.data?.status === 'processing') {
        return 30000;
      }
      return false;
    },
  });
}

interface CreateJobParams {
  files: string[];
  outputFolder: string;
  options: TranscriptionOptions;
  normalizeAudio?: boolean;
  overwrite?: boolean;
  dryRun?: boolean;
}

export function useCreateJob(): UseMutationResult<Job, Error, CreateJobParams> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params) => {
      const response = await apiClient.post<{ job_id: string }>('/jobs', {
        file_paths: params.files,
        options: params.options,
        output_folder: params.outputFolder,
        normalize_audio: params.normalizeAudio ?? false,
        overwrite: params.overwrite ?? false,
        dry_run: params.dryRun ?? false,
      });
      return toJob(await apiClient.get<BackendJob>(`/jobs/${response.job_id}`));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

export function useCancelJob(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId) => apiClient.post<void>(`/jobs/${jobId}/cancel`),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.job(jobId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

export function useDeleteJob(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId) => apiClient.delete<void>(`/jobs/${jobId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
    },
  });
}

// Models Hooks
export function useModels(): UseQueryResult<Model[]> {
  return useQuery({
    queryKey: queryKeys.models,
    queryFn: async () => {
      const response = await apiClient.get<{ models: BackendModelState[] }>('/models');
      return response.models.map(toModel);
    },
    staleTime: 30000, // Consider fresh for 30 seconds
  });
}

export function useModel(modelId: string): UseQueryResult<Model> {
  return useQuery({
    queryKey: queryKeys.model(modelId),
    queryFn: () => apiClient.get<Model>(`/models/${modelId}`),
    enabled: !!modelId,
  });
}

export function useDownloadModel(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (modelId) => apiClient.post<void>(`/models/${modelId}/download`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
    },
  });
}

export function useLoadModel(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (modelId) => apiClient.post<void>(`/models/${modelId}/load`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
    },
  });
}

export function useUnloadModel(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (modelId) => apiClient.post<void>(`/models/${modelId}/unload`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
    },
  });
}

export function useDeleteModel(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (modelId) => apiClient.delete<void>(`/models/${modelId}`, { confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
    },
  });
}

// Settings Hooks
export function useSettings(): UseQueryResult<Config> {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => apiClient.get<Config>('/settings'),
    staleTime: 60000, // Consider fresh for 1 minute
  });
}

export function useUpdateSettings(): UseMutationResult<Config, Error, Partial<Config>> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings) => apiClient.put<Config>('/settings', { updates: settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

export interface OpenRouterKeyStatus {
  configured: boolean;
}

export function useOpenRouterKeyStatus(): UseQueryResult<OpenRouterKeyStatus> {
  return useQuery({
    queryKey: queryKeys.openrouterKey,
    queryFn: () => apiClient.get<OpenRouterKeyStatus>('/settings/openrouter-key'),
    staleTime: 30000,
  });
}

export function useSaveOpenRouterKey(): UseMutationResult<OpenRouterKeyStatus, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (apiKey) =>
      apiClient.put<OpenRouterKeyStatus>('/settings/openrouter-key', { api_key: apiKey }),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.openrouterKey, status);
    },
  });
}

// Results Hooks
export function useTranscriptionResult(jobId: string): UseQueryResult<TranscriptionResult> {
  return useQuery({
    queryKey: queryKeys.result(jobId),
    queryFn: () => apiClient.get<TranscriptionResult>(`/jobs/${jobId}/result`),
    enabled: !!jobId,
    staleTime: 5000,
  });
}

export function useExportResult(): UseMutationResult<
  void,
  Error,
  { jobId: string; format: 'txt' | 'srt' | 'vtt' | 'json' }
> {
  return useMutation({
    mutationFn: async ({ jobId, format }) => {
      const blob = await apiClient.get<Blob>(`/jobs/${jobId}/export?format=${format}`);

      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transcription-${jobId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
  });
}

// File Upload Hook
export function useUploadFiles(): UseMutationResult<{ file_paths: string[] }, Error, File[]> {
  return useMutation({
    mutationFn: (files) => apiClient.uploadFiles(files),
  });
}
