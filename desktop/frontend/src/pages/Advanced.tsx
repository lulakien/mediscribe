import { useState, useEffect, useRef } from 'react';
import {
  Server,
  Zap,
  Film,
  HardDrive,
  Copy,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useSettings } from '@/api/hooks';

interface BackendStatus {
  status: 'running' | 'stopped' | 'error';
  port?: number;
  uptime?: string;
  pid?: number;
}

interface CudaStatus {
  available: boolean;
  deviceName?: string;
  status: 'ready' | 'unavailable' | 'error';
}

interface FfmpegStatus {
  available: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
  version?: string;
  ffprobeAvailable: boolean;
}

interface CacheInfo {
  location: string;
  size: string;
}

interface SystemInfo {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  pythonVersion: string;
  pythonExecutable: string;
  platform: string;
}

interface RunLog {
  id: string;
  name: string;
  path: string;
  date: string;
  size_bytes?: number;
}

export default function Advanced() {
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    status: 'stopped',
  });

  const { data: settings } = useSettings();
  const { data: health } = useQuery({
    queryKey: ['backend-health'],
    queryFn: () => apiClient.get<{
      cuda_available?: boolean;
      cuda_device?: string;
      ffmpeg_available?: boolean;
      ffmpeg_path?: string;
      ffprobe_available?: boolean;
      ffprobe_path?: string;
      ffmpeg_version?: string;
      python_version?: string;
      python_executable?: string;
      platform?: string;
      version?: string;
      status?: string;
    }>('/health'),
    refetchInterval: 10000,
    retry: false,
  });
  const { data: cacheInfoResponse, refetch: refetchCache } = useQuery({
    queryKey: ['models', 'cache', 'info'],
    queryFn: () => apiClient.get<{ cache_path?: string; readable_size?: string; error?: string }>('/models/cache/info'),
    staleTime: 30000,
  });
  const { data: appInfo } = useQuery({
    queryKey: ['desktop-app-info'],
    queryFn: () => window.mediscribe.getAppInfo(),
    retry: false,
  });

  const [selectedLog, setSelectedLog] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [liveLogContent, setLiveLogContent] = useState<string>('');
  const logViewerRef = useRef<HTMLDivElement>(null);
  const outputFolder = settings?.defaultOutputFolder || '';
  const logsPath = outputFolder ? `${outputFolder}/logs` : '';
  const manifestCsvPath = outputFolder ? `${outputFolder}/manifests/manifest.csv` : '';
  const manifestJsonPath = outputFolder ? `${outputFolder}/manifests/manifest.json` : '';
  const logsQueryPath = outputFolder ? `/logs?output_folder=${encodeURIComponent(outputFolder)}` : '/logs';
  const { data: logsResponse, refetch: refetchLogs } = useQuery({
    queryKey: ['logs', outputFolder],
    queryFn: () => apiClient.get<{ logs: RunLog[] }>(logsQueryPath),
    enabled: Boolean(outputFolder),
    staleTime: 10000,
  });
  const runLogs = logsResponse?.logs || [];
  const selectedLogPath = runLogs.find((log) => log.id === selectedLog)?.path || selectedLog;
  const { data: logPreview } = useQuery({
    queryKey: ['logs', 'preview', selectedLogPath],
    queryFn: () => apiClient.get<{ content: string; truncated?: boolean }>(
      `/logs/preview?path=${encodeURIComponent(selectedLogPath)}&output_folder=${encodeURIComponent(outputFolder)}`
    ),
    enabled: Boolean(selectedLogPath),
    staleTime: 5000,
  });
  const cacheInfo: CacheInfo = {
    location: cacheInfoResponse?.cache_path || 'Unavailable',
    size: cacheInfoResponse?.readable_size || 'Unavailable',
  };
  const cudaStatus: CudaStatus = {
    available: health?.cuda_available ?? false,
    deviceName: health?.cuda_device,
    status: health?.cuda_available ? 'ready' : 'unavailable',
  };
  const ffmpegStatus: FfmpegStatus = {
    available: health?.ffmpeg_available ?? false,
    ffmpegPath: health?.ffmpeg_path,
    ffprobeAvailable: health?.ffprobe_available ?? false,
    ffprobePath: health?.ffprobe_path,
    version: health?.ffmpeg_version,
  };
  const systemInfo: SystemInfo = {
    appVersion: appInfo?.appVersion || health?.version || 'Unknown',
    electronVersion: appInfo?.electronVersion || 'Unknown',
    nodeVersion: appInfo?.nodeVersion || 'Unknown',
    chromeVersion: appInfo?.chromeVersion || 'Unknown',
    pythonVersion: health?.python_version || 'Unknown',
    pythonExecutable: health?.python_executable || 'Unknown',
    platform: health?.platform || appInfo?.platform || 'Unknown',
  };
  const logContent = liveLogContent || logPreview?.content
    || (outputFolder
      ? `No run log selected or available.\n\nRun logs are read from:\n${logsPath}`
      : 'Choose a default output folder in Settings before run logs are available.');

  useEffect(() => {
    if (!selectedLog && runLogs.length > 0) {
      setSelectedLog(runLogs[0].id);
    }
  }, [selectedLog, runLogs]);

  useEffect(() => {
    setLiveLogContent(logPreview?.content || '');
  }, [logPreview?.content, selectedLogPath]);

  useEffect(() => {
    if (!selectedLogPath) return;

    const controller = new AbortController();
    const decoder = new TextDecoder();

    const streamLog = async () => {
      try {
        const stream = await apiClient.getStream(
          `/logs/tail?path=${encodeURIComponent(selectedLogPath)}&output_folder=${encodeURIComponent(outputFolder)}`,
          controller.signal,
        );
        const reader = stream.getReader();
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            setLiveLogContent((current) => current + decoder.decode(value, { stream: true }));
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Log tail stream failed:', error);
        }
      }
    };

    void streamLog();
    return () => controller.abort();
  }, [outputFolder, selectedLogPath]);

  useEffect(() => {
    let cancelled = false;

    const refreshBackendStatus = async () => {
      try {
        const info = await window.mediscribe.getBackendInfo();
        if (cancelled) return;
        const port = info.url ? Number(new URL(info.url).port) : undefined;
        setBackendStatus({ status: info.url ? 'running' : 'stopped', port });
      } catch {
        if (!cancelled) {
          setBackendStatus({ status: 'error' });
        }
      }
    };

    void refreshBackendStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (autoScroll && logViewerRef.current) {
      logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight;
    }
  }, [logContent, autoScroll]);

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleRevealPath = (path: string) => {
    if (window.mediscribe?.revealPath) {
      window.mediscribe.revealPath(path);
    }
  };

  const handleRefreshCache = () => {
    void refetchCache();
  };

  const getStatusBadgeVariant = (status: string): "completed" | "failed" | "warning" | "default" => {
    switch (status) {
      case 'running':
      case 'ready':
        return 'completed';
      case 'error':
      case 'unavailable':
        return 'failed';
      case 'stopped':
        return 'warning';
      default:
        return 'default';
    }
  };

  return (
    <div className="flex flex-col gap-12 max-w-7xl mx-auto px-8 py-8">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="text-h1 font-display font-semibold text-wood tracking-tight">Advanced</h1>
        <p className="text-body text-text-muted">
          System status, logs, and debug information.
        </p>
      </div>

      {/* Status Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Backend Status */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <Server className="w-5 h-5 text-text-muted" />
              <Badge variant={getStatusBadgeVariant(backendStatus.status)}>
                {backendStatus.status}
              </Badge>
            </div>
            <CardTitle className="text-[1.125rem] mt-3">Backend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-small text-text-muted space-y-1">
              {backendStatus.port && (
                <div className="flex justify-between">
                  <span>Port:</span>
                  <span className="font-mono">{backendStatus.port}</span>
                </div>
              )}
              {backendStatus.uptime && (
                <div className="flex justify-between">
                  <span>Uptime:</span>
                  <span className="font-mono">{backendStatus.uptime}</span>
                </div>
              )}
              {backendStatus.pid && (
                <div className="flex justify-between">
                  <span>PID:</span>
                  <span className="font-mono">{backendStatus.pid}</span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="compact"
              className="w-full mt-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </CardContent>
        </Card>

        {/* CUDA Status */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <Zap className="w-5 h-5 text-text-muted" />
              <Badge variant={getStatusBadgeVariant(cudaStatus.status)}>
                {cudaStatus.available ? 'available' : 'unavailable'}
              </Badge>
            </div>
            <CardTitle className="text-[1.125rem] mt-3">CUDA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cudaStatus.available ? (
              <div className="text-small text-text-muted space-y-1">
                <div className="flex flex-col gap-1">
                  <span className="text-text-faint">Device:</span>
                  <span className="text-text">{cudaStatus.deviceName}</span>
                </div>
              </div>
            ) : (
              <p className="text-small text-text-muted">
                CUDA not available. Using CPU.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ffmpeg/ffprobe Status */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <Film className="w-5 h-5 text-text-muted" />
              <Badge variant={ffmpegStatus.available ? 'completed' : 'failed'}>
                {ffmpegStatus.available ? 'found' : 'missing'}
              </Badge>
            </div>
            <CardTitle className="text-[1.125rem] mt-3">ffmpeg</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ffmpegStatus.available ? (
              <div className="text-small text-text-muted space-y-1">
                {ffmpegStatus.version && (
                  <div className="flex justify-between">
                    <span>Version:</span>
                    <span className="font-mono">{ffmpegStatus.version}</span>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-text-faint">Path:</span>
                  <span className="font-mono text-[0.75rem] truncate" title={ffmpegStatus.ffmpegPath}>
                    {ffmpegStatus.ffmpegPath}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-text-faint">ffprobe:</span>
                  <span className="font-mono text-[0.75rem] truncate" title={ffmpegStatus.ffprobePath}>
                    {ffmpegStatus.ffprobeAvailable ? ffmpegStatus.ffprobePath : 'missing'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-small text-text-muted">
                <p className="mb-2">Backend reports ffmpeg missing. Install with:</p>
                <code className="block bg-surface-2 rounded px-2 py-1 font-mono text-[0.75rem]">
                  sudo apt install ffmpeg
                </code>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cache Status */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <HardDrive className="w-5 h-5 text-text-muted" />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleRefreshCache}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
            <CardTitle className="text-[1.125rem] mt-3">Cache</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-small text-text-muted space-y-1">
              <div className="flex justify-between">
                <span>Size:</span>
                <span className="font-mono">{cacheInfo.size}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-text-faint">Location:</span>
                <button
                  className="font-mono text-[0.75rem] text-left truncate hover:text-primary transition-colors"
                  title={cacheInfo.location}
                  onClick={() => handleCopyToClipboard(cacheInfo.location)}
                >
                  {cacheInfo.location}
                </button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="compact"
              className="w-full mt-2"
              onClick={() => cacheInfo.location !== 'Unavailable' && handleRevealPath(cacheInfo.location)}
              disabled={cacheInfo.location === 'Unavailable'}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Open
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Run Log Viewer */}
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-h2 font-display font-semibold text-text">Run Logs</h2>
            <p className="text-small text-text-muted mt-1">
              View detailed logs from transcription runs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-small text-text-muted">
              <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
              Auto-scroll
            </label>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              onClick={() => void refetchLogs()}
              disabled={!outputFolder}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Select value={selectedLog} onValueChange={setSelectedLog} disabled={runLogs.length === 0}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select a run" />
              </SelectTrigger>
              <SelectContent>
                {runLogs.map((log) => (
                  <SelectItem key={log.id} value={log.id}>
                    {log.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card variant="soft">
          <CardContent className="p-0">
            <div
              ref={logViewerRef}
              className="h-[400px] overflow-y-auto p-6 font-mono text-[0.8125rem] text-text whitespace-pre-wrap bg-surface-2 rounded-card"
            >
              {logContent || 'No logs available'}
            </div>
          </CardContent>
          <div className="px-6 pb-6 pt-3">
            <Button
              variant="ghost"
              size="compact"
              onClick={() => handleCopyToClipboard(logContent)}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy all
            </Button>
          </div>
        </Card>
      </div>

      {/* Manifest Access */}
      <div className="space-y-4">
        <div>
          <h2 className="text-h2 font-display font-semibold text-text">Manifest Files</h2>
          <p className="text-small text-text-muted mt-1">
            Access manifest files for completed runs
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-surface-2 rounded-button">
                <span className="font-mono text-small text-text truncate flex-1">
                  {manifestCsvPath || 'Choose an output folder in Settings'}
                </span>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!manifestCsvPath}
                    onClick={() => handleCopyToClipboard(manifestCsvPath)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!manifestCsvPath}
                    onClick={() => handleRevealPath(manifestCsvPath)}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-surface-2 rounded-button">
                <span className="font-mono text-small text-text truncate flex-1">
                  {manifestJsonPath || 'Choose an output folder in Settings'}
                </span>
                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!manifestJsonPath}
                    onClick={() => handleCopyToClipboard(manifestJsonPath)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={!manifestJsonPath}
                    onClick={() => handleRevealPath(manifestJsonPath)}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Debug Info */}
      <div className="space-y-4">
        <div>
          <h2 className="text-h2 font-display font-semibold text-text">Debug Information</h2>
          <p className="text-small text-text-muted mt-1">
            System information for bug reports
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="space-y-2 font-mono text-small">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">App Version:</span>
                <span className="text-text">{systemInfo.appVersion}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Electron:</span>
                <span className="text-text">{systemInfo.electronVersion}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Node.js:</span>
                <span className="text-text">{systemInfo.nodeVersion}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Chromium:</span>
                <span className="text-text">{systemInfo.chromeVersion}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-text-muted">Python:</span>
                <span className="text-text">{systemInfo.pythonVersion}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border gap-4">
                <span className="text-text-muted">Python Path:</span>
                <span className="text-text truncate" title={systemInfo.pythonExecutable}>{systemInfo.pythonExecutable}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-text-muted">Platform:</span>
                <span className="text-text text-right">{systemInfo.platform}</span>
              </div>
            </div>
            <Button
              variant="secondary"
              size="compact"
              className="w-full mt-4"
              onClick={() => {
                const debugInfo = `MediScribe Debug Info
App Version: ${systemInfo.appVersion}
Electron: ${systemInfo.electronVersion}
Node.js: ${systemInfo.nodeVersion}
Chromium: ${systemInfo.chromeVersion}
Python: ${systemInfo.pythonVersion}
Python Path: ${systemInfo.pythonExecutable}
Platform: ${systemInfo.platform}
Backend: ${backendStatus.status} (port ${backendStatus.port})
CUDA: ${cudaStatus.available ? 'Available' : 'Unavailable'}${cudaStatus.deviceName ? ` - ${cudaStatus.deviceName}` : ''}
ffmpeg: ${ffmpegStatus.available ? `Available - ${ffmpegStatus.ffmpegPath}` : 'Missing'}
ffprobe: ${ffmpegStatus.ffprobeAvailable ? `Available - ${ffmpegStatus.ffprobePath}` : 'Missing'}`;
                handleCopyToClipboard(debugInfo);
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy debug info
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
