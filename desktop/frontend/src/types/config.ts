/**
 * Configuration types matching backend config_manager.py schema
 *
 * Matches ConfigSchema from desktop/backend/config_manager.py
 */

export interface Config {
  // Schema version for future migrations
  v: number;

  // Transcription defaults
  defaultOutputFolder: string | null;
  defaultModel: string;
  defaultPreset: string;

  // UI state
  showWelcomeOnLaunch: boolean;
  firstLaunchCompleted: boolean;
  theme: 'Warm Light' | 'Study Night' | 'System';
  advancedMode: boolean;

  // Backend settings (advanced)
  language: string;
  initialPrompt: string;

  // Last custom advanced settings (preserved when switching from preset to custom)
  customAdvanced: CustomAdvancedSettings;

  // Optional API gateway settings
  apiGateway: ApiGatewaySettings;

  // Recent output folders for Results page
  recentOutputFolders: string[];
}

export interface CustomAdvancedSettings {
  model: string;
  device: string;
  compute_type: string;
  beam_size: number;
  vad_filter: boolean;
  normalize_audio: boolean;
  overwrite_outputs: boolean;
  condition_on_previous_text: boolean;
  temperature: number;
}

export interface ApiGatewaySettings {
  enabled: boolean;
  provider: 'openrouter' | null;
  endpoint_url: string | null;
  api_key_env_var: string | null;
  model_name: 'microsoft/mai-transcribe-1.5' | 'microsoft/mai-transcribe-2' | null;
  timeout_seconds: number;
}

export type ThemeOption = 'Warm Light' | 'Study Night' | 'System';

export type PresetOption =
  | 'Best Quality'
  | 'Bad Audio / Conference Hall'
  | 'Fast Batch'
  | 'Low VRAM Safe'
  | 'Custom';
