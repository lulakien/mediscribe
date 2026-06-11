import { useState } from "react";
import { FolderOpen, ChevronDown, ChevronUp, Check, AlertCircle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSettings, useUpdateSettings, useModels } from "@/api/hooks";
import { cn } from "@/lib/utils";
import type { Config, ThemeOption } from "@/types";

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const { data: models } = useModels();
  const updateSettings = useUpdateSettings();

  const [savedStates, setSavedStates] = useState<Record<string, boolean>>({});
  const [backendCollapsed, setBackendCollapsed] = useState(true);

  // Show "Saved ✓" feedback for 2 seconds after save
  const showSavedFeedback = (key: string) => {
    setSavedStates((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setSavedStates((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  // Handler to update a setting and persist immediately
  const handleSettingChange = async <K extends keyof Config>(
    key: K,
    value: Config[K]
  ) => {
    if (!settings) return;

    try {
      await updateSettings.mutateAsync({ [key]: value } as Partial<Config>);
      showSavedFeedback(key as string);
    } catch (error) {
      console.error("Failed to save setting:", error);
    }
  };

  // Handler for folder picker using Electron API
  const handlePickFolder = async () => {
    if (window.mediscribe?.pickFolder) {
      const folder = await window.mediscribe.pickFolder();
      if (folder) {
        await handleSettingChange("defaultOutputFolder", folder);
      }
    }
  };

  // Handler to open data folder
  const handleOpenDataFolder = () => {
    if (window.mediscribe?.openPath && settings?.defaultOutputFolder) {
      window.mediscribe.openPath(settings.defaultOutputFolder);
    }
  };

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-muted">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[760px] mx-auto py-12 px-8 space-y-12">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="text-h1 font-display font-semibold text-wood tracking-tight">
          Settings
        </h1>
        <p className="text-body text-text-muted">
          Configure defaults and preferences for MediScribe Local
        </p>
      </div>

      {/* 1. Defaults Card */}
      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
          <CardDescription>
            Default options for new transcription sessions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Output Folder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="output-folder">Default Output Folder</Label>
              {savedStates.defaultOutputFolder && (
                <span className="text-small text-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="output-folder"
                value={settings.defaultOutputFolder || ""}
                readOnly
                className="font-mono text-small flex-1"
              />
              <Button
                variant="secondary"
                size="default"
                onClick={handlePickFolder}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Choose...
              </Button>
            </div>
          </div>

          {/* Default Model */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="default-model">Default Model</Label>
              {savedStates.defaultModel && (
                <span className="text-small text-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>
            <Select
              value={settings.defaultModel}
              onValueChange={(value) => handleSettingChange("defaultModel", value)}
            >
              <SelectTrigger id="default-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models?.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <span className="flex items-center gap-2">
                      {model.name}
                      {model.loaded && (
                        <span className="text-success">✓</span>
                      )}
                      {!model.loaded && (
                        <span className="text-text-faint">⚠ not installed</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Default Preset */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="default-preset">Default Preset</Label>
              {savedStates.defaultPreset && (
                <span className="text-small text-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>
            <Select
              value={settings.defaultPreset || "Best Quality"}
              onValueChange={(value) => handleSettingChange("defaultPreset", value)}
            >
              <SelectTrigger id="default-preset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Best Quality">Best Quality</SelectItem>
                <SelectItem value="Bad Audio / Conference Hall">Bad Audio / Conference Hall</SelectItem>
                <SelectItem value="Fast Batch">Fast Batch</SelectItem>
                <SelectItem value="Low VRAM Safe">Low VRAM Safe</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 2. Appearance & Behavior Card */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Control how MediScribe looks and behaves
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Welcome Screen Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1 flex-1">
              <Label htmlFor="show-welcome">Show welcome screen on launch</Label>
              <p className="text-small text-text-muted font-normal normal-case">
                Display the welcome animation when opening the app
              </p>
            </div>
            <div className="flex items-center gap-3">
              {savedStates.showWelcomeOnLaunch && (
                <span className="text-small text-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              <Switch
                id="show-welcome"
                checked={settings.showWelcomeOnLaunch}
                onCheckedChange={(checked) =>
                  handleSettingChange("showWelcomeOnLaunch", checked)
                }
              />
            </div>
          </div>

          {/* Theme */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="theme">Theme</Label>
              {savedStates.theme && (
                <span className="text-small text-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>
            <Select
              value={settings.theme}
              onValueChange={(value) => handleSettingChange("theme", value as ThemeOption)}
            >
              <SelectTrigger id="theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Warm Light</SelectItem>
                <SelectItem value="dark">Study Night</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 3. Advanced Mode Card */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced Mode</CardTitle>
          <CardDescription>
            Enable power-user features and detailed controls
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1 flex-1">
              <Label htmlFor="advanced-mode">Enable Advanced Mode</Label>
              <p className="text-small text-text-muted font-normal normal-case">
                Shows Segments JSON in Results, reveals Advanced/Logs nav item, and exposes backend settings
              </p>
            </div>
            <div className="flex items-center gap-3">
              {savedStates.advancedMode && (
                <span className="text-small text-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              <Switch
                id="advanced-mode"
                checked={settings.advancedMode}
                onCheckedChange={(checked) =>
                  handleSettingChange("advancedMode", checked)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Backend Settings Card (Advanced, Collapsed) */}
      <Collapsible open={!backendCollapsed} onOpenChange={(open: boolean) => setBackendCollapsed(!open)}>
        <Card className={cn(settings.advancedMode ? "" : "opacity-50 pointer-events-none")}>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full group">
                <div className="text-left">
                  <CardTitle className="group-hover:text-primary transition-colors">
                    Backend Settings
                    <span className="ml-2 text-small font-normal text-text-faint">(Advanced)</span>
                  </CardTitle>
                  <CardDescription>
                    Configure the local transcription engine
                  </CardDescription>
                </div>
                {backendCollapsed ? (
                  <ChevronDown className="w-5 h-5 text-text-muted" />
                ) : (
                  <ChevronUp className="w-5 h-5 text-text-muted" />
                )}
              </button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {/* Backend Port Info */}
              <div className="space-y-2">
                <Label>Backend Port</Label>
                <Input
                  value="Auto (ephemeral)"
                  readOnly
                  className="font-mono text-small"
                  disabled
                />
                <p className="text-small text-text-muted">
                  The backend binds to 127.0.0.1 with an OS-assigned ephemeral port for security
                </p>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="language">Language</Label>
                  {savedStates.language && (
                    <span className="text-small text-success flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Saved
                    </span>
                  )}
                </div>
                <Select
                  value={settings.language}
                  onValueChange={(value) => handleSettingChange("language", value)}
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tr">Turkish (tr)</SelectItem>
                    <SelectItem value="en">English (en)</SelectItem>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Initial Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="initial-prompt">Initial Prompt</Label>
                  {savedStates.initialPrompt && (
                    <span className="text-small text-success flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Saved
                    </span>
                  )}
                </div>
                <Textarea
                  id="initial-prompt"
                  value={settings.initialPrompt || ""}
                  onChange={(e) => handleSettingChange("initialPrompt", e.target.value)}
                  placeholder="Turkish medical terminology prompt..."
                  rows={4}
                  className="text-small"
                />
                <p className="text-small text-text-muted">
                  Optional context to improve medical term recognition
                </p>
              </div>

              {/* Restart Backend Button */}
              <div className="pt-2">
                <Button variant="secondary" size="default" disabled>
                  Restart Backend
                </Button>
                <p className="text-small text-text-muted mt-2">
                  Backend management will be available in a future update
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* 5. Future Backends Placeholder Card */}
      <Card className="opacity-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Transcription Backends
            <span className="text-small font-normal text-text-faint">(Coming Later)</span>
          </CardTitle>
          <CardDescription>
            Cloud transcription services (optional and opt-in)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-body text-text-muted">
            MediScribe currently transcribes only on this device. Cloud backends (OpenAI, Google,
            Deepgram, Azure, custom gateway) may be added later and will always be opt-in.
          </p>
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder="Local Whisper (active)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local Whisper</SelectItem>
              <SelectItem value="openai" disabled>OpenAI (coming later)</SelectItem>
              <SelectItem value="google" disabled>Google Speech (coming later)</SelectItem>
              <SelectItem value="deepgram" disabled>Deepgram (coming later)</SelectItem>
              <SelectItem value="azure" disabled>Azure (coming later)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 6. Privacy Statement Card */}
      <Card variant="soft" className="bg-olive-soft border-olive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-olive">
            <AlertCircle className="w-5 h-5" />
            Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-body text-text">
            <strong>Local mode is the default and only active mode.</strong> Audio files never leave
            this computer. Network access is used only when you download a model from Hugging Face.
          </p>
          <p className="text-body text-text-muted">
            All transcription happens on your device using your GPU. No telemetry, no analytics,
            no cloud processing unless you explicitly opt into a future cloud backend.
          </p>
          <Button
            variant="ghost"
            size="compact"
            onClick={handleOpenDataFolder}
            className="mt-2"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Data Folder
          </Button>
        </CardContent>
      </Card>

      {/* 7. Logs Card */}
      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
          <CardDescription>
            Access application and transcription logs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Show Logs Panel Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-1 flex-1">
              <Label htmlFor="show-logs">Show log panel in workspace footer</Label>
              <p className="text-small text-text-muted font-normal normal-case">
                Display a collapsible log viewer at the bottom of the workspace
              </p>
            </div>
            <div className="flex items-center gap-3">
              {savedStates.show_logs && (
                <span className="text-small text-success flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              <Switch
                id="show-logs"
                checked={false}
                disabled
              />
            </div>
          </div>

          {/* Open Logs Folder Button */}
          <div>
            <Button
              variant="secondary"
              size="default"
              onClick={() => {
                if (window.mediscribe?.openPath && settings.defaultOutputFolder) {
                  const logsPath = `${settings.defaultOutputFolder}/logs`;
                  window.mediscribe.openPath(logsPath);
                }
              }}
              disabled={!settings.defaultOutputFolder}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Logs Folder
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
