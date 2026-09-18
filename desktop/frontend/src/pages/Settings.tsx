import { useEffect, useState } from "react";
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
import type { ApiGatewaySettings, Config, ThemeOption } from "@/types";

const OPENROUTER_DEFAULT_MODEL = "microsoft/mai-transcribe-2" as const;
const OPENROUTER_DEFAULT_KEY_ENV = "OPENROUTER_API_KEY";
const DEFAULT_GATEWAY: ApiGatewaySettings = {
  enabled: false,
  provider: null,
  endpoint_url: null,
  api_key_env_var: null,
  model_name: null,
  timeout_seconds: 60,
};

export default function Settings() {
  const { data: settings, isLoading } = useSettings();
  const { data: models } = useModels();
  const updateSettings = useUpdateSettings();

  const [savedStates, setSavedStates] = useState<Record<string, boolean>>({});
  const [backendCollapsed, setBackendCollapsed] = useState(true);
  const [openRouterModel, setOpenRouterModel] = useState<string>(OPENROUTER_DEFAULT_MODEL);
  const [openRouterKeyEnv, setOpenRouterKeyEnv] = useState(OPENROUTER_DEFAULT_KEY_ENV);

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

  useEffect(() => {
    const gateway = settings?.apiGateway;
    if (!gateway) return;
    setOpenRouterModel(gateway.model_name || OPENROUTER_DEFAULT_MODEL);
    setOpenRouterKeyEnv(gateway.api_key_env_var || OPENROUTER_DEFAULT_KEY_ENV);
  }, [settings?.apiGateway?.api_key_env_var, settings?.apiGateway?.model_name]);

  const handleOpenRouterChange = async (updates: Partial<ApiGatewaySettings>) => {
    if (!settings) return;
    const current = { ...DEFAULT_GATEWAY, ...(settings.apiGateway || {}) };
    const next: ApiGatewaySettings = {
      ...current,
      ...updates,
      provider: updates.enabled === false ? current.provider : "openrouter",
      endpoint_url: null,
      model_name: updates.model_name || current.model_name || OPENROUTER_DEFAULT_MODEL,
      api_key_env_var: updates.api_key_env_var || current.api_key_env_var || OPENROUTER_DEFAULT_KEY_ENV,
      timeout_seconds: current.timeout_seconds || 60,
    };
    await handleSettingChange("apiGateway", next);
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

      {/* 5. Optional Cloud Backend Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Cloud transcription
            <span className="text-small font-normal text-text-faint">(Optional)</span>
          </CardTitle>
          <CardDescription>
            Use Microsoft MAI-Transcribe through OpenRouter when you explicitly enable it
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label htmlFor="openrouter-enabled">Enable OpenRouter transcription</Label>
              <p className="text-small text-text-muted font-normal normal-case">
                Local Whisper stays the default while this is off.
              </p>
            </div>
            <Switch
              id="openrouter-enabled"
              checked={settings.apiGateway?.enabled === true && settings.apiGateway.provider === "openrouter"}
              onCheckedChange={(enabled) => void handleOpenRouterChange({ enabled })}
            />
          </div>

          <div className={cn("space-y-4", !(settings.apiGateway?.enabled && settings.apiGateway.provider === "openrouter") && "opacity-60")}>
            <div className="space-y-2">
              <Label htmlFor="openrouter-model">Microsoft transcription model</Label>
              <Select
                value={openRouterModel}
                onValueChange={(value) => {
                  setOpenRouterModel(value);
                  void handleOpenRouterChange({ model_name: value as ApiGatewaySettings["model_name"] });
                }}
              >
                <SelectTrigger id="openrouter-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="microsoft/mai-transcribe-2">MAI-Transcribe 2 (recommended)</SelectItem>
                  <SelectItem value="microsoft/mai-transcribe-1.5">MAI-Transcribe 1.5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="openrouter-key-env">API key environment variable</Label>
              <Input
                id="openrouter-key-env"
                value={openRouterKeyEnv}
                onChange={(event) => setOpenRouterKeyEnv(event.target.value)}
                onBlur={() => void handleOpenRouterChange({ api_key_env_var: openRouterKeyEnv.trim() || OPENROUTER_DEFAULT_KEY_ENV })}
                className="font-mono text-small"
                spellCheck={false}
              />
              <p className="text-small text-text-muted">
                Only this variable name is saved. Put the real key in that variable before launching the app; the key is never stored by MediScribe.
              </p>
            </div>
          </div>

          <div className="rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-small text-text-muted">
            OpenRouter mode sends prepared audio to the cloud and does not fall back to local transcription if the request fails.
          </div>
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
            <strong>Local mode is the default.</strong> Audio stays on this computer unless you explicitly enable OpenRouter cloud transcription.
          </p>
          <p className="text-body text-text-muted">
            In cloud mode, the prepared audio is sent to OpenRouter for Microsoft transcription. The API key is read from the configured environment variable and is not persisted in settings, logs, or transcript artifacts.
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
