import { useState, useMemo, useEffect } from 'react';
import { Search, Copy, FolderOpen, AlertTriangle, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useJobs, useTranscriptionResult } from '@/api/hooks';
import { cn } from '@/lib/utils';
import type { Job } from '@/types';

type FilterStatus = 'all' | 'completed' | 'warnings' | 'failed';

interface ResultRowProps {
  job: Job;
  isSelected: boolean;
  onSelect: (jobId: string) => void;
}

const ResultRow: React.FC<ResultRowProps> = ({ job, isSelected, onSelect }) => {
  const hasWarnings = job.error && job.status === 'completed';
  const statusVariant =
    job.status === 'completed' ? (hasWarnings ? 'warning' : 'completed') :
    job.status === 'failed' ? 'failed' :
    job.status === 'processing' ? 'running' : 'skipped';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (files: string[]) => {
    // This would ideally come from job metadata
    return `${files.length} file${files.length !== 1 ? 's' : ''}`;
  };

  return (
    <Card
      variant={isSelected ? 'selected' : 'interactive'}
      className={cn(
        'p-4 cursor-pointer transition-all duration-150',
        isSelected && 'border-primary border-[1.5px]'
      )}
      onClick={() => onSelect(job.id)}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-text leading-tight truncate flex-1">
            {job.input_files[0]?.split('/').pop() || 'Untitled'}
          </h4>
          {hasWarnings && (
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-text-muted font-mono">
          <span>{formatDate(job.created_at)}</span>
          <span>·</span>
          <span>{formatDuration(job.input_files)}</span>
          <span>·</span>
          <span className="font-sans">{job.model_id}</span>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={statusVariant} pulse={job.status === 'processing'}>
            {job.status}
          </Badge>
        </div>
      </div>
    </Card>
  );
};

interface TranscriptPreviewProps {
  jobId: string;
  job: Job;
}

const TranscriptPreview: React.FC<TranscriptPreviewProps> = ({ jobId, job }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'timestamped' | 'segments'>('text');
  const { data: result, isLoading, error } = useTranscriptionResult(jobId);

  const handleCopyAll = () => {
    if (result?.text) {
      navigator.clipboard.writeText(result.text);
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
  };

  const handleRevealPath = (path: string) => {
    if (window.mediscribe?.revealPath) {
      window.mediscribe.revealPath(path);
    }
  };

  const handleOpenOutputFolder = () => {
    if (job.output_file && window.mediscribe?.openPath) {
      const folder = job.output_file.substring(0, job.output_file.lastIndexOf('/'));
      window.mediscribe.openPath(folder);
    }
  };

  const formatTimestamp = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderTimestampedText = () => {
    if (!result?.segments) return null;

    return (
      <div className="space-y-4">
        {result.segments.map((segment) => (
          <div key={segment.id} className="space-y-1">
            <div className="inline-flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded-pill bg-surface-2 text-text-faint font-mono text-[0.8125rem]">
                {formatTimestamp(segment.start)}
              </span>
            </div>
            <p className="text-[0.9375rem] leading-[1.7] text-text">
              {segment.text}
            </p>
          </div>
        ))}
      </div>
    );
  };

  const renderSegmentsJson = () => {
    if (!result?.segments) return null;

    return (
      <pre className="text-[0.8125rem] font-mono text-text whitespace-pre-wrap break-words">
        {JSON.stringify(result.segments, null, 2)}
      </pre>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-text-muted">Loading transcript...</div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <Card variant="soft" className="p-6">
        <div className="flex flex-col items-center justify-center space-y-3 text-center">
          <XCircle className="w-12 h-12 text-error" />
          <div>
            <h3 className="font-medium text-text mb-1">File moved or deleted</h3>
            <p className="text-text-muted text-small">
              The transcript file could not be found at the recorded path
            </p>
            {job.output_file && (
              <p className="text-text-faint font-mono text-[0.8125rem] mt-2 break-all">
                {job.output_file}
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  const outputFiles = {
    txt: job.output_file,
    md: job.output_file?.replace(/\.txt$/, '.md'),
    json: job.output_file?.replace(/\.txt$/, '.json'),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-h2 text-text mb-2 truncate">
              {job.input_files[0]?.split('/').pop() || 'Untitled'}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-mono text-text-muted">
              {result.duration && (
                <>
                  <span>{Math.floor(result.duration / 60)}m {Math.floor(result.duration % 60)}s</span>
                  <span>·</span>
                </>
              )}
              <span>{job.model_id}</span>
              <span>·</span>
              <span>transcribe</span>
              {result.language && (
                <>
                  <span>·</span>
                  <span className="uppercase">{result.language}</span>
                </>
              )}
            </div>
          </div>
          <Badge
            variant={job.status === 'completed' ? 'completed' : 'failed'}
          >
            {job.status}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="timestamped">Timestamped</TabsTrigger>
            <TabsTrigger value="segments">Segments JSON</TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="compact"
            onClick={handleCopyAll}
            className="gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy all
          </Button>
        </div>

        <TabsContent value="text">
          <Card variant="default" className="p-6 bg-surface">
            <div className="prose prose-mediscribe max-w-none">
              <p className="text-[0.9375rem] leading-[1.7] text-text whitespace-pre-wrap">
                {result.text}
              </p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="timestamped">
          <Card variant="default" className="p-6 bg-surface">
            <div className="prose prose-mediscribe max-w-none">
              {renderTimestampedText()}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="segments">
          <Card variant="default" className="p-6 bg-surface">
            {renderSegmentsJson()}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Files Section */}
      <div className="space-y-3">
        <h3 className="font-medium text-h3 text-text">Output Files</h3>
        <Card variant="soft" className="p-4">
          <div className="space-y-3">
            {Object.entries(outputFiles).map(([format, path]) => (
              path && (
                <div
                  key={format}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                      <span className="text-small font-medium text-text uppercase">
                        {format}
                      </span>
                    </div>
                    <p className="font-mono text-[0.8125rem] text-text-muted truncate">
                      {path}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="compact"
                      onClick={() => handleCopyPath(path)}
                      className="gap-2"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="compact"
                      onClick={() => handleRevealPath(path)}
                      className="gap-2"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Reveal
                    </Button>
                  </div>
                </div>
              )
            ))}

            <div className="pt-3 border-t border-border">
              <Button
                variant="secondary"
                onClick={handleOpenOutputFolder}
                className="w-full gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                Open output folder
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default function Results() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data: jobs = [], isLoading } = useJobs();

  // Filter and search jobs
  const filteredJobs = useMemo(() => {
    let filtered = jobs;

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(job => {
        if (filterStatus === 'completed') {
          return job.status === 'completed' && !job.error;
        }
        if (filterStatus === 'warnings') {
          return job.status === 'completed' && job.error;
        }
        if (filterStatus === 'failed') {
          return job.status === 'failed';
        }
        return true;
      });
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(job =>
        job.input_files.some(file =>
          file.toLowerCase().includes(query)
        )
      );
    }

    // Sort by newest first
    return filtered.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [jobs, filterStatus, searchQuery]);

  // Auto-select first job if none selected
  useEffect(() => {
    if (!selectedJobId && filteredJobs.length > 0) {
      setSelectedJobId(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId]);

  const selectedJob = filteredJobs.find(job => job.id === selectedJobId);

  const getFilterCount = (status: FilterStatus) => {
    if (status === 'all') return jobs.length;
    if (status === 'completed') return jobs.filter(j => j.status === 'completed' && !j.error).length;
    if (status === 'warnings') return jobs.filter(j => j.status === 'completed' && j.error).length;
    if (status === 'failed') return jobs.filter(j => j.status === 'failed').length;
    return 0;
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Page Header */}
      <div className="flex-shrink-0 px-8 py-6 border-b border-border">
        <h1 className="font-display text-h1 text-text mb-2">Results</h1>
        <p className="text-body text-text-muted">
          Browse and preview your completed transcriptions
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - List */}
        <div className="w-5/12 border-r border-border flex flex-col">
          {/* Toolbar */}
          <div className="flex-shrink-0 p-4 space-y-4 border-b border-border">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                type="text"
                placeholder="Search by filename..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'completed', 'warnings', 'failed'] as FilterStatus[]).map((status) => (
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
                  <span className="ml-1.5 opacity-70">
                    {getFilterCount(status)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-text-muted">Loading results...</div>
              </div>
            ) : filteredJobs.length === 0 ? (
              <Card variant="soft" className="p-8">
                <div className="flex flex-col items-center justify-center text-center space-y-3">
                  <FileText className="w-12 h-12 text-text-muted" />
                  <div>
                    <h3 className="font-medium text-text mb-1">
                      {searchQuery ? 'No matches found' : 'No transcripts yet'}
                    </h3>
                    <p className="text-text-muted text-small">
                      {searchQuery
                        ? 'Try a different search term'
                        : 'Completed transcriptions will appear here'
                      }
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              filteredJobs.map((job) => (
                <ResultRow
                  key={job.id}
                  job={job}
                  isSelected={job.id === selectedJobId}
                  onSelect={setSelectedJobId}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1 overflow-y-auto p-8">
          {selectedJob ? (
            <TranscriptPreview
              jobId={selectedJob.id}
              job={selectedJob}
            />
          ) : (
            <Card variant="soft" className="p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-3">
                <CheckCircle2 className="w-16 h-16 text-text-muted" />
                <div>
                  <h3 className="font-medium text-text mb-1">
                    Select a result to preview
                  </h3>
                  <p className="text-text-muted text-small">
                    Choose a transcript from the list to view its contents
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
