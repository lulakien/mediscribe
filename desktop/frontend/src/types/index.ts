// Core domain types for MediScribe

export interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  updated_at: string;
  input_files: string[];
  output_folder?: string;
  output_file?: string;
  error?: string;
  model_id: string;
  options: TranscriptionOptions;
  current_file?: string;
  status_rows?: Array<Record<string, unknown>>;
}

export interface Model {
  id: string;
  name: string;
  description: string;
  size: string;
  loaded: boolean;
  download_progress?: number;
  local_path?: string;
}

export interface ManifestRow {
  file_path: string;
  file_name: string;
  file_size: number;
  duration?: number;
  format?: string;
  selected: boolean;
}

export interface TranscriptionOptions {
  model_name: string;
  backend?: string;
  device?: string;
  compute_type?: string;
  language?: string;
  initial_prompt?: string;
  temperature?: number;
  beam_size?: number;
  condition_on_previous_text?: boolean;
  vad_filter?: boolean;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  tokens?: number[];
  temperature?: number;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
  words?: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  probability: number;
}

export interface ProgressEvent {
  type: 'job_update' | 'model_update' | 'download_progress' | 'error';
  job_id?: string;
  model_id?: string;
  status?: string;
  progress?: number;
  message?: string;
  error?: string;
}

export interface Settings {
  output_directory: string;
  default_model: string;
  concurrent_jobs: number;
  theme: 'light' | 'dark' | 'system';
  language: string;
}

// Re-export from specialized type modules
export type { BackendInfo, BackendStatus, BackendStatusCallback } from './backend';
export type {
  Config,
  CustomAdvancedSettings,
  ApiGatewaySettings,
  ThemeOption,
  PresetOption
} from './config';

// API Response types
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
