import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useJobs } from '@/api/hooks';
import { cn } from '@/lib/utils';
import type { Job } from '@/types';

type FilterStatus = 'all' | 'running' | 'completed' | 'failed' | 'skipped';

interface JobRowData {
  id: string;
  fileName: string;
  duration: number | null;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  processingTime: number | null;
  realtimeFactor: number | null;
  model: string;
  warnings: string[];
  startedAt?: string;
  finishedAt?: string;
  device?: string;
  computeType?: string;
  outputStem?: string;
  errorMessage?: string;
}

interface ExpandedRowProps {
  row: JobRowData;
}

const ExpandedRow: React.FC<ExpandedRowProps> = ({ row }) => {
  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="px-4 py-4 bg-surface-2/30 border-t border-border/30">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-small">
        <div>
          <span className="text-text-muted font-medium">Started:</span>
          <span className="ml-2 font-mono text-text">{formatTimestamp(row.startedAt)}</span>
        </div>
        <div>
          <span className="text-text-muted font-medium">Finished:</span>
          <span className="ml-2 font-mono text-text">{formatTimestamp(row.finishedAt)}</span>
        </div>
        <div>
          <span className="text-text-muted font-medium">Device:</span>
          <span className="ml-2 font-mono text-text">{row.device || '—'}</span>
        </div>
        <div>
          <span className="text-text-muted font-medium">Compute Type:</span>
          <span className="ml-2 font-mono text-text">{row.computeType || '—'}</span>
        </div>
        {row.outputStem && (
          <div className="col-span-2">
            <span className="text-text-muted font-medium">Output Stem:</span>
            <span className="ml-2 font-mono text-text text-[0.8125rem]">{row.outputStem}</span>
          </div>
        )}
        {row.errorMessage && (
          <div className="col-span-2">
            <span className="text-text-muted font-medium">Error:</span>
            <p className="mt-1 font-mono text-[0.8125rem] text-error bg-error-soft p-3 rounded-lg">
              {row.errorMessage}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

interface JobTableRowProps {
  row: JobRowData;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
}

const JobTableRow: React.FC<JobTableRowProps> = ({ row, isExpanded, onToggleExpand }) => {
  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '—';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatProcessingTime = (seconds: number | null) => {
    if (seconds === null) return '—';
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatRealtimeFactor = (factor: number | null) => {
    if (factor === null) return '—';
    // Convert 0.18 (slower than realtime) to "5.5× realtime" (faster than realtime)
    const realtimeSpeed = 1 / factor;
    return `${realtimeSpeed.toFixed(1)}× realtime`;
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'running':
        return 'running';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'skipped':
        return 'skipped';
      default:
        return 'default';
    }
  };

  const hasWarnings = row.warnings.length > 0;
  const isRunning = row.status === 'running';
  const isFailed = row.status === 'failed';

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer transition-colors relative',
          isRunning && 'animate-running-border',
          isFailed && 'bg-error-soft/30'
        )}
        onClick={() => onToggleExpand(row.id)}
      >
        <TableCell className="w-10">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted" />
          )}
        </TableCell>
        <TableCell className="font-medium text-text max-w-xs">
          <div className="truncate" title={row.fileName}>
            {row.fileName}
          </div>
        </TableCell>
        <TableCell numeric>{formatDuration(row.duration)}</TableCell>
        <TableCell>
          <Badge variant={getStatusVariant(row.status)} pulse={isRunning}>
            {row.status}
          </Badge>
        </TableCell>
        <TableCell numeric>{formatProcessingTime(row.processingTime)}</TableCell>
        <TableCell numeric title={row.realtimeFactor !== null ? `Raw: ${row.realtimeFactor.toFixed(2)}×` : undefined}>
          {formatRealtimeFactor(row.realtimeFactor)}
        </TableCell>
        <TableCell className="font-sans">{row.model}</TableCell>
        <TableCell className="text-center">
          {hasWarnings || isFailed ? (
            <div className="relative group inline-block">
              <AlertTriangle
                className={cn(
                  'w-4 h-4 cursor-help',
                  isFailed ? 'text-error' : 'text-warning'
                )}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface border border-border rounded-lg shadow-card opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none z-10 min-w-[200px] max-w-[300px]">
                <div className="text-left text-small text-text space-y-1">
                  {row.warnings.map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-warning flex-shrink-0">•</span>
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <span className="text-text-faint">—</span>
          )}
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="p-0">
            <ExpandedRow row={row} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

export default function Jobs() {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: jobs = [], isLoading } = useJobs();

  // Transform Job data to JobRowData
  const transformJobToRowData = (job: Job): JobRowData => {
    // Extract file name from first input file
    const fileName = job.input_files[0]?.split('/').pop() || 'Unknown';

    // Determine status
    let status: JobRowData['status'] = 'completed';
    if (job.status === 'processing' || job.status === 'pending') {
      status = 'running';
    } else if (job.status === 'failed') {
      status = 'failed';
    } else if (job.status === 'completed') {
      status = 'completed';
    }

    const duration = null;
    const processingTime = null;
    const realtimeFactor = null;

    // Parse warnings from error field (if it contains warnings but status is completed)
    const warnings: string[] = [];
    if (job.error && status === 'completed') {
      warnings.push(job.error);
    }

    return {
      id: job.id,
      fileName,
      duration,
      status,
      processingTime,
      realtimeFactor,
      model: job.model_id,
      warnings,
      startedAt: job.created_at,
      finishedAt: job.updated_at,
      device: job.options.device || '—',
      computeType: job.options.compute_type || '—',
      outputStem: job.output_file,
      errorMessage: status === 'failed' ? job.error : undefined,
    };
  };

  const rowData = useMemo(() => {
    return jobs.map(transformJobToRowData);
  }, [jobs]);

  // Filter rows based on status
  const filteredRows = useMemo(() => {
    if (filterStatus === 'all') {
      return rowData;
    }
    return rowData.filter((row) => row.status === filterStatus);
  }, [rowData, filterStatus]);

  const handleToggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getFilterCount = (status: FilterStatus) => {
    if (status === 'all') return rowData.length;
    return rowData.filter((row) => row.status === status).length;
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Page Header */}
      <div className="flex-shrink-0 px-8 py-6 border-b border-border">
        <h1 className="font-display text-h1 text-text mb-2">Jobs</h1>
        <p className="text-body text-text-muted">
          View the complete transcription queue and job history
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Filter Chips */}
        <div className="flex-shrink-0 px-8 py-4 border-b border-border">
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'running', 'completed', 'failed', 'skipped'] as FilterStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  'px-3 py-1.5 rounded-pill text-[0.8125rem] font-medium transition-colors',
                  filterStatus === status
                    ? 'bg-primary-soft text-primary'
                    : 'bg-surface-2 text-text-muted hover:bg-border'
                )}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className="ml-1.5 opacity-70">{getFilterCount(status)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-text-muted">Loading jobs...</div>
            </div>
          ) : filteredRows.length === 0 ? (
            <Card variant="soft" className="p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-3">
                <Info className="w-12 h-12 text-text-muted" />
                <div>
                  <h3 className="font-medium text-text mb-1">No jobs yet</h3>
                  <p className="text-text-muted text-small">
                    Transcription jobs will appear here once you start processing files
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Processing Time</TableHead>
                  <TableHead className="text-right">Realtime Factor</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-center">Warnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <JobTableRow
                    key={row.id}
                    row={row}
                    isExpanded={expandedRows.has(row.id)}
                    onToggleExpand={handleToggleExpand}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* CSS for animated border on running rows */}
      <style>{`
        @keyframes shimmer {
          0% {
            box-shadow: -3px 0 0 0 transparent inset;
          }
          50% {
            box-shadow: -3px 0 0 0 var(--primary) inset;
          }
          100% {
            box-shadow: -3px 0 0 0 transparent inset;
          }
        }

        .animate-running-border {
          animation: shimmer 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
