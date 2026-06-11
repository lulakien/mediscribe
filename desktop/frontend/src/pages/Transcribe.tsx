import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileAudio,
  FolderOpen,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Play,
  ScanSearch,
  StopCircle,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { apiClient } from '@/api/client';
import { useCancelJob, useCreateJob, useJob, useModels, useSettings } from '@/api/hooks';
import { cn } from '@/lib/utils';
import type { TranscriptionOptions } from '@/types';

// Preset definitions matching DESIGN.md §6.2
const PRESETS = [
  {
    id: 'best-quality',
    name: 'Best Quality',
    description: 'Recommended for lectures',
    settings: { model: 'large-v3', device: 'cuda', compute_type: 'float16', beam_size: 5, vad: true, normalization: false },
  },
  {
    id: 'bad-audio',
    name: 'Bad Audio / Conference Hall',
    description: 'Enhanced processing for noisy environments',
    settings: { model: 'large-v3', device: 'cuda', compute_type: 'float16', beam_size: 5, vad: true, normalization: true },
  },
  {
    id: 'fast-batch',
    name: 'Fast Batch',
    description: 'Quick processing for multiple files',
    settings: { model: 'large-v3-turbo', device: 'cuda', compute_type: 'float16', beam_size: 3, vad: true, normalization: false },
  },
  {
    id: 'low-vram',
    name: 'Low VRAM Safe',
    description: 'Fits in 8GB VRAM',
    settings: { model: 'large-v3', device: 'cuda', compute_type: 'int8_float16', beam_size: 3, vad: true, normalization: false },
  },
];

interface AudioFile {
  path: string;
  name: string;
  duration: number;
  size: number;
  status: 'supported' | 'unsupported';
  reason?: string;
}

interface RunState {
  status: 'idle' | 'active' | 'finished';
  terminalStatus?: 'completed' | 'failed' | 'cancelled';
  currentFile?: string;
  progress: number;
  filesCompleted: number;
  filesTotal: number;
  elapsed: number;
  realtimeFactor: number;
  audioProcessed: number;
  completedCount: number;
  skippedCount: number;
  failedCount: number;
  warningCount: number;
  cancelRequested: boolean;
  queueRows: Array<{
    file: string;
    duration: number;
    status: 'pending' | 'probing' | 'processing' | 'completed' | 'failed' | 'skipped' | 'cancelled';
    warning?: string;
  }>;
  previewText?: string;
}

interface FileInspectResponse {
  supported: Array<{
    source_path: string;
    original_filename: string;
    duration_seconds?: number | null;
    file_size_mb?: number | null;
    warnings: string[];
  }>;
  unsupported: Array<{
    source_path: string;
    original_filename?: string | null;
    reason: string;
  }>;
}

export default function Transcribe() {
  const navigate = useNavigate();
  const [selectedFiles, setSelectedFiles] = useState<AudioFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('best-quality');
  const [outputFolder, setOutputFolder] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Advanced settings
  const [model, setModel] = useState('large-v3');
  const [device, setDevice] = useState('auto');
  const [computeType, setComputeType] = useState('float16');
  const [beamSize, setBeamSize] = useState('5');
  const [vad, setVad] = useState(true);
  const [normalization, setNormalization] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

  const { data: settings } = useSettings();
  const { data: models = [] } = useModels();
  const createJob = useCreateJob();
  const cancelJob = useCancelJob();
  const { data: activeJob } = useJob(activeJobId || '');

  // Run state
  const [runState, setRunState] = useState<RunState>({
    status: 'idle',
    progress: 0,
    filesCompleted: 0,
    filesTotal: 0,
    elapsed: 0,
    realtimeFactor: 0,
    audioProcessed: 0,
    completedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    warningCount: 0,
    cancelRequested: false,
    queueRows: [],
  });

  useEffect(() => {
    if (settings?.defaultOutputFolder && !outputFolder) {
      setOutputFolder(settings.defaultOutputFolder);
    }
  }, [settings?.defaultOutputFolder, outputFolder]);

  useEffect(() => {
    if (!activeJob) return;

    const durationByKey = new Map<string, number>();
    selectedFiles.forEach((file) => {
      durationByKey.set(file.path, file.duration);
      durationByKey.set(file.name, file.duration);
    });
    const fileRows = activeJob.status_rows?.length
      ? activeJob.status_rows.map((row) => {
          const file = String(row.file || row.source || 'Audio file');
          const statusValue = String(row.status || '').toLowerCase();
          const rowStatus: RunState['queueRows'][number]['status'] =
            statusValue === 'completed'
              ? 'completed'
              : statusValue === 'failed'
              ? 'failed'
              : statusValue === 'skipped' || statusValue === 'scan_only' || statusValue === 'unsupported'
              ? 'skipped'
              : statusValue === 'cancelled'
              ? 'cancelled'
              : statusValue === 'probing'
              ? 'probing'
              : statusValue === 'processing' || file === activeJob.current_file || row.source === activeJob.current_file
              ? 'processing'
              : 'pending';
          const durationSeconds = Number(row.duration_seconds);
          const warning = String(row.warning || row.error || row['warning/error'] || '') || undefined;

          return {
            file,
            duration: Number.isFinite(durationSeconds)
              ? Math.round(durationSeconds)
              : durationByKey.get(String(row.source || '')) || durationByKey.get(file) || 0,
            status: rowStatus,
            warning,
          };
        })
      : activeJob.input_files.map((path) => {
          const selected = selectedFiles.find((file) => file.path === path);
          return {
            file: selected?.name || path.split('/').pop() || path,
            duration: selected?.duration || 0,
            status:
              path === activeJob.current_file
                ? ('processing' as const)
                : activeJob.status === 'completed'
                ? ('completed' as const)
                : activeJob.status === 'cancelled'
                ? ('cancelled' as const)
                : ('pending' as const),
            warning: undefined,
          };
        });

    if (activeJob.cancel_requested) {
      for (const row of fileRows) {
        if (row.status === 'pending' || row.status === 'probing') {
          row.status = 'skipped';
          row.warning = row.warning || 'Will be skipped';
        }
      }
    }

    const completedCount = fileRows.filter((row) => row.status === 'completed').length;
    const failedCount = fileRows.filter((row) => row.status === 'failed').length;
    const skippedCount = fileRows.filter((row) => row.status === 'skipped').length;
    const warningCount = fileRows.filter((row) => row.warning).length;
    const metrics = activeJob.metrics || activeJob.last_progress_event?.metrics;
    const elapsed = Math.floor(metrics?.total_elapsed_time || 0);
    const audioProcessed = Math.floor(metrics?.total_processed_duration || 0);
    const realtimeFactor = metrics?.total_elapsed_time && metrics.total_elapsed_time > 0
      ? (metrics.total_processed_duration || 0) / metrics.total_elapsed_time
      : metrics?.realtime_factor || 0;
    const isFinished = ['completed', 'failed', 'cancelled'].includes(activeJob.status);

    setRunState({
      status:
        isFinished
          ? 'finished'
          : activeJob.status === 'processing' || activeJob.status === 'pending'
          ? 'active'
          : 'idle',
      terminalStatus: isFinished ? activeJob.status as RunState['terminalStatus'] : undefined,
      currentFile: activeJob.current_file?.split('/').pop() || fileRows.find((row) => row.status === 'processing')?.file,
      progress: activeJob.progress,
      filesCompleted: completedCount,
      filesTotal: activeJob.input_files.length,
      elapsed,
      realtimeFactor,
      audioProcessed,
      completedCount,
      skippedCount,
      failedCount: activeJob.status === 'failed' && failedCount === 0 ? 1 : failedCount,
      warningCount,
      cancelRequested: Boolean(activeJob.cancel_requested),
      queueRows: fileRows,
    });
  }, [activeJob, selectedFiles]);

  useEffect(() => {
    if (runState.status !== 'active' || activeJob?.metrics?.total_elapsed_time) return;
    const startedAt = activeJob?.updated_at ? new Date(activeJob.updated_at).getTime() : Date.now();
    const interval = window.setInterval(() => {
      setRunState((current) => (
        current.status === 'active'
          ? { ...current, elapsed: Math.max(current.elapsed, Math.floor((Date.now() - startedAt) / 1000)) }
          : current
      ));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeJob?.metrics?.total_elapsed_time, activeJob?.updated_at, runState.status]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  // File picker
  const handleAddFiles = async () => {
    setActionError(null);

    try {
      const paths = await window.mediscribe.pickFiles();
      if (!paths?.length) return;

      const inspected = await apiClient.post<FileInspectResponse>('/files/inspect', {
        file_paths: paths,
      });

      const supported: AudioFile[] = inspected.supported.map((file) => ({
        path: file.source_path,
        name: file.original_filename,
        duration: Math.round(file.duration_seconds || 0),
        size: Math.round((file.file_size_mb || 0) * 1024 * 1024),
        status: 'supported',
        reason: file.warnings.join('; ') || undefined,
      }));

      const unsupported: AudioFile[] = inspected.unsupported.map((file) => ({
        path: file.source_path,
        name: file.original_filename || file.source_path.split('/').pop() || file.source_path,
        duration: 0,
        size: 0,
        status: 'unsupported',
        reason: file.reason,
      }));

      setSelectedFiles((current) => {
        const byPath = new Map(current.map((file) => [file.path, file]));
        for (const file of [...supported, ...unsupported]) {
          byPath.set(file.path, file);
        }
        return Array.from(byPath.values());
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not inspect selected files');
    }
  };

  const handleRemoveFile = (path: string) => {
    setSelectedFiles(selectedFiles.filter((f) => f.path !== path));
  };

  const handleClearAll = () => {
    setSelectedFiles([]);
  };

  // Folder picker
  const handleChooseFolder = async () => {
    setActionError(null);

    try {
      const folder = await window.mediscribe.pickFolder();
      if (folder) {
        setOutputFolder(folder);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not choose output folder');
    }
  };

  // Preset selection
  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setModel(preset.settings.model);
      setDevice(preset.settings.device);
      setComputeType(preset.settings.compute_type);
      setBeamSize(preset.settings.beam_size.toString());
      setVad(preset.settings.vad);
      setNormalization(preset.settings.normalization);
    }
  };

  // Run actions
  const buildOptions = (): TranscriptionOptions => ({
    model_name: model,
    backend: 'local_whisper',
    device,
    compute_type: computeType,
    language: settings?.language || 'tr',
    initial_prompt: settings?.initialPrompt || '',
    beam_size: Number.parseInt(beamSize, 10),
    vad_filter: vad,
    condition_on_previous_text: false,
    temperature: 0,
  });

  const startJob = async (dryRun: boolean) => {
    setActionError(null);

    const supportedFiles = selectedFiles.filter((file) => file.status === 'supported');
    if (!supportedFiles.length) {
      setActionError('Choose at least one supported audio file.');
      return;
    }
    if (!outputFolder) {
      setActionError('Choose an output folder before starting.');
      return;
    }

    try {
      await apiClient.post('/files/ensure-output-folder', { folder_path: outputFolder });
      const job = await createJob.mutateAsync({
        files: supportedFiles.map((file) => file.path),
        outputFolder,
        options: buildOptions(),
        normalizeAudio: normalization,
        overwrite,
        dryRun,
      });
      setActiveJobId(job.id);
      setRunState({
        status: 'active',
        currentFile: supportedFiles[0]?.name,
        progress: job.progress,
        filesCompleted: 0,
        filesTotal: supportedFiles.length,
        elapsed: 0,
        realtimeFactor: 0,
        audioProcessed: 0,
        completedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        warningCount: 0,
        cancelRequested: false,
        queueRows: supportedFiles.map((file) => ({
          file: file.name,
          duration: file.duration,
          status: 'pending',
        })),
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not start transcription job');
    }
  };

  const handleStartTranscribing = () => {
    void startJob(false);
  };

  const handleScanOnly = () => {
    void startJob(true);
  };

  const handleStopAfterCurrent = () => {
    if (!activeJobId) return;
    cancelJob.mutate(activeJobId, {
      onError: (error) => setActionError(error.message),
    });
  };

  // Computed values
  const totalDuration = selectedFiles.reduce((sum, f) => sum + (f.duration || 0), 0);
  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const selectedModel = models.find((item) => item.id === model);
  const modelInstalled = Boolean(selectedModel?.loaded);
  const canStart = selectedFiles.some((file) => file.status === 'supported') && modelInstalled && !createJob.isPending;

  const formatDuration = (seconds: number) => {
    const wholeSeconds = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(wholeSeconds / 3600);
    const m = Math.floor((wholeSeconds % 3600) / 60);
    const s = wholeSeconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  const formatTime = (seconds: number) => {
    const wholeSeconds = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(wholeSeconds / 60);
    const s = wholeSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-8 max-w-[1200px] mx-auto">
      {/* Left column - Input & Options */}
      <div className="flex-1 lg:w-7/12 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-h1 font-display font-semibold mb-2">Transcribe</h1>
          <p className="text-body text-text-muted">Add audio files and configure transcription settings</p>
        </div>

        {/* Drop zone card */}
        <Card
          variant="default"
          className={cn(
            'border-2 border-dashed transition-all',
            isDragging && 'border-primary bg-primary-soft/30 scale-[1.02]',
            selectedFiles.length === 0 && 'min-h-[160px]'
          )}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <CardContent className="flex flex-col items-center justify-center py-12 px-6">
            <FileAudio className="h-12 w-12 text-text-muted mb-4" strokeWidth={1.5} />
            <p className="text-body text-text-muted mb-4">Drag audio files here</p>
            <Button variant="secondary" onClick={handleAddFiles}>
              <FileAudio className="h-4 w-4 mr-2" />
              Add audio files
            </Button>
            {selectedFiles.length === 0 && (
              <p className="text-small text-text-faint mt-4">
                Supported: MP3, M4A, WAV, FLAC, OGG, Opus, WebM
              </p>
            )}
          </CardContent>
        </Card>

        {/* Selected files table */}
        {selectedFiles.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right font-mono">Duration</TableHead>
                      <TableHead className="text-right font-mono">Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedFiles.map((file) => (
                      <TableRow key={file.path}>
                        <TableCell className="font-medium">{file.name}</TableCell>
                        <TableCell className="text-right font-mono text-small">
                          {formatDuration(file.duration)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-small">
                          {formatSize(file.size)}
                        </TableCell>
                        <TableCell>
                          {file.status === 'supported' ? (
                            <Badge variant="completed">Supported</Badge>
                          ) : (
                            <Badge variant="unsupported">
                              {file.reason || 'Unsupported'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveFile(file.path)}
                            className="h-6 w-6"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between px-6 py-4 border-t border-border/50">
                <div className="flex gap-3 text-small text-text-muted">
                  <span>{selectedFiles.length} files</span>
                  <span>•</span>
                  <span className="font-mono">{formatDuration(totalDuration)}</span>
                  <span>•</span>
                  <span className="font-mono">{formatSize(totalSize)}</span>
                </div>
                <Button variant="ghost" size="compact" onClick={handleClearAll}>
                  Clear all
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Run options card */}
        <Card>
          <CardHeader>
            <CardTitle>Run Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Preset selector */}
            <div className="space-y-3">
              <label className="text-small font-semibold text-text-muted uppercase tracking-[0.06em]">
                Preset
              </label>
              <div className="grid grid-cols-2 gap-3">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetChange(preset.id)}
                    className={cn(
                      'px-4 py-3 rounded-button border text-left transition-all',
                      selectedPreset === preset.id
                        ? 'border-primary bg-primary-soft/40 border-[1.5px]'
                        : 'border-border bg-surface hover:border-border-strong'
                    )}
                  >
                    <div className="font-medium text-body">{preset.name}</div>
                    <div className="text-small text-text-muted mt-1">{preset.description}</div>
                  </button>
                ))}
              </div>

              {/* Resolved settings summary */}
              <div className="flex items-start gap-2 px-4 py-3 bg-surface-2 rounded-button">
                <div className="text-mono-small text-text-muted flex-1">
                  {model}{' '}
                  {modelInstalled ? (
                    <span className="text-success">✓ installed</span>
                  ) : (
                    <span className="text-warning">⚠ not installed</span>
                  )}{' '}
                  · {device} · {computeType} · beam {beamSize} · VAD {vad ? 'on' : 'off'} ·
                  normalization {normalization ? 'on' : 'off'}
                </div>
              </div>
            </div>

            {/* Output folder */}
            <div className="space-y-3">
              <label className="text-small font-semibold text-text-muted uppercase tracking-[0.06em]">
                Output Folder
              </label>
              <div className="flex gap-2">
                <div className="flex-1 px-3 py-2 bg-surface-2 rounded-button border border-border font-mono text-small text-text truncate">
                  {outputFolder || 'Choose an output folder'}
                </div>
                <Button variant="secondary" onClick={handleChooseFolder}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Choose
                </Button>
              </div>
            </div>

            {/* Advanced settings */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-body font-medium text-text hover:text-primary transition-colors">
                  {advancedOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  Advanced
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                {/* Model */}
                <div className="space-y-2">
                  <label className="text-small font-medium text-text">Model</label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="large-v3">large-v3</SelectItem>
                      <SelectItem value="large-v3-turbo">large-v3-turbo</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                      <SelectItem value="small">small</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Device */}
                <div className="space-y-2">
                  <label className="text-small font-medium text-text">Device</label>
                  <Select value={device} onValueChange={setDevice}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="cuda">CUDA</SelectItem>
                      <SelectItem value="cpu">CPU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Compute Type */}
                <div className="space-y-2">
                  <label className="text-small font-medium text-text">Compute Type</label>
                  <Select value={computeType} onValueChange={setComputeType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="float16">float16</SelectItem>
                      <SelectItem value="int8_float16">int8_float16</SelectItem>
                      <SelectItem value="int8">int8</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Beam Size */}
                <div className="space-y-2">
                  <label className="text-small font-medium text-text">Beam Size</label>
                  <Select value={beamSize} onValueChange={setBeamSize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="7">7</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* VAD */}
                <div className="flex items-center justify-between">
                  <label className="text-small font-medium text-text">Voice Activity Detection (VAD)</label>
                  <Switch checked={vad} onCheckedChange={setVad} />
                </div>

                {/* Normalization */}
                <div className="flex items-center justify-between">
                  <label className="text-small font-medium text-text">Audio Normalization</label>
                  <Switch checked={normalization} onCheckedChange={setNormalization} />
                </div>

                {/* Overwrite */}
                <div className="flex items-center justify-between">
                  <label className="text-small font-medium text-text">Overwrite Existing Outputs</label>
                  <Switch checked={overwrite} onCheckedChange={setOverwrite} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            className="flex-1"
            disabled={!canStart}
            onClick={handleStartTranscribing}
          >
            <Play className="h-4 w-4 mr-2" />
            {createJob.isPending ? 'Starting...' : 'Start transcribing'}
          </Button>
          <Button
            variant="secondary"
            disabled={!canStart}
            onClick={handleScanOnly}
          >
            <ScanSearch className="h-4 w-4 mr-2" />
            Scan only
          </Button>
        </div>

        {actionError && (
          <Card variant="soft" className="bg-error-soft border-error">
            <CardContent className="flex items-start gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
              <p className="text-body text-text">{actionError}</p>
            </CardContent>
          </Card>
        )}

        {/* Model not installed warning */}
        {!modelInstalled && (
          <Card variant="soft" className="bg-warning-soft border-warning">
            <CardContent className="flex items-start gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-body text-text mb-2">Install a model first</p>
                <Button variant="secondary" size="compact">
                  Go to Models
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right column - Run Panel */}
      <div className="flex-1 lg:w-5/12">
        <Card className="sticky top-8">
          <CardHeader>
            <CardTitle>Run Status</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Idle state */}
            {runState.status === 'idle' && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-32 h-32 mb-6 relative">
                  {/* Stacked note cards illustration */}
                  <div className="absolute inset-0 bg-surface-2 rounded-card border border-border transform rotate-6"></div>
                  <div className="absolute inset-0 bg-surface-2 rounded-card border border-border transform rotate-3"></div>
                  <div className="absolute inset-0 bg-surface rounded-card border border-border shadow-card"></div>
                </div>
                <p className="text-body text-text-muted mb-6">Ready when you are.</p>
                {runState.completedCount > 0 && (
                  <div className="text-small text-text-muted">
                    <p className="mb-2">
                      Last run: {runState.completedCount} files · {formatTime(runState.elapsed)}
                    </p>
                    <Button variant="ghost" size="compact" onClick={() => navigate('/results')}>
                      View results
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Active state */}
            {runState.status === 'active' && (
              <div className="space-y-6">
                {/* Current file */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-olive animate-pulse" />
                    <p className="text-small text-text-muted">
                      {runState.cancelRequested ? 'Stopping after current file' : 'Processing'}
                    </p>
                  </div>
                  <p className="text-body font-medium truncate mb-3">
                    {runState.cancelRequested ? 'Completing current file...' : runState.currentFile}
                  </p>
                  <Progress value={runState.progress} max={100} showPercent />
                </div>

                {/* Counters grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-small text-text-muted">Elapsed</p>
                    <p className="font-mono text-body text-text">{formatTime(runState.elapsed)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-small text-text-muted">Files</p>
                    <p className="font-mono text-body text-text">
                      {runState.filesCompleted}/{runState.filesTotal}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-small text-text-muted">Realtime Factor</p>
                    <p className="font-mono text-body text-text">{runState.realtimeFactor.toFixed(1)}×</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-small text-text-muted">Audio Processed</p>
                    <p className="font-mono text-body text-text">
                      {formatDuration(runState.audioProcessed)}
                    </p>
                  </div>
                </div>

                {/* Queue table */}
                <div>
                  <p className="text-small text-text-muted mb-3">Queue</p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {runState.queueRows.map((row, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-button border border-border transition-all',
                          row.status === 'processing' && 'bg-primary-soft/20 border-primary/30',
                          row.status === 'probing' && 'bg-primary-soft/10 border-primary/20',
                          row.status === 'completed' && 'bg-success-soft/20',
                          row.status === 'failed' && 'bg-error-soft/20',
                          (row.status === 'cancelled' || (runState.cancelRequested && row.status === 'skipped')) && 'opacity-70'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-small font-medium truncate">{row.file}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-mono-small text-text-muted">
                              {formatDuration(row.duration)}
                            </span>
                            <Badge
                              variant={
                                row.status === 'completed'
                                  ? 'completed'
                                  : row.status === 'processing' || row.status === 'probing'
                                  ? 'running'
                                  : row.status === 'failed'
                                  ? 'failed'
                                  : row.status === 'cancelled'
                                  ? 'cancelled'
                                  : row.status === 'skipped'
                                  ? 'skipped'
                                  : 'default'
                              }
                              pulse={row.status === 'processing' || row.status === 'probing'}
                            >
                              {runState.cancelRequested && row.status === 'skipped' ? 'will be skipped' : row.status}
                            </Badge>
                            {row.warning && (
                              <AlertCircle className="h-3 w-3 text-warning" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stop button */}
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={handleStopAfterCurrent}
                  disabled={!activeJobId || cancelJob.isPending || runState.cancelRequested}
                >
                  <StopCircle className="h-4 w-4 mr-2" />
                  {runState.cancelRequested ? 'Stopping...' : 'Stop after current file'}
                </Button>
              </div>
            )}

            {/* Finished state */}
            {runState.status === 'finished' && (
              <div className="space-y-6">
                {/* Summary banner */}
                <Card
                  variant="soft"
                  className={cn(
                    runState.failedCount > 0
                      ? 'bg-error-soft border-error'
                      : runState.warningCount > 0 || runState.skippedCount > 0
                      ? 'bg-warning-soft border-warning'
                      : 'bg-success-soft border-success'
                  )}
                >
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-success" />
                      <p className="text-body font-medium">
                        {runState.terminalStatus === 'cancelled'
                          ? 'Transcription cancelled'
                          : runState.terminalStatus === 'failed'
                          ? 'Transcription failed'
                          : 'Transcription complete'}
                      </p>
                    </div>
                    <div className="flex gap-4 text-small text-text-muted">
                      {runState.completedCount > 0 && (
                        <span>{runState.completedCount} completed</span>
                      )}
                      {runState.skippedCount > 0 && (
                        <span>{runState.skippedCount} skipped</span>
                      )}
                      {runState.failedCount > 0 && (
                        <span>{runState.failedCount} failed</span>
                      )}
                      <span>•</span>
                      <span className="font-mono">{formatTime(runState.elapsed)} total</span>
                    </div>
                    <Button variant="secondary" size="compact" onClick={() => navigate('/results')}>
                      View results
                    </Button>
                  </CardContent>
                </Card>

                {/* Result preview */}
                {runState.previewText && (
                  <div>
                    <p className="text-small text-text-muted mb-3">Preview</p>
                    <div className="bg-surface border border-border rounded-card p-6 space-y-3 max-h-[400px] overflow-y-auto">
                      <p className="text-body leading-relaxed text-text">
                        {runState.previewText}
                      </p>
                      <Button variant="ghost" size="compact" onClick={() => navigate('/results')}>
                        Open in Results
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
