import * as vscode from "vscode";

export interface ItemConfig {
  type: string;
  command?: string;
  dependsOn?: string[];
  items?: Record<string, ItemConfig>;
}

export interface LogPatterns {
  error: string[];
  warning: string[];
}

export interface WaveformConfig {
  viewer: string;
  viewerArgs: string[];
}

export interface RegressionConfig {
  logPatterns: LogPatterns;
  waveform: WaveformConfig;
  resultsDir: string;
}

export interface HDLRunnerSettings {
  items: Record<string, ItemConfig>;
  flatItems: Record<string, ItemConfig>;
  tests: Record<string, { plusargs: string[]; seed?: number }>;
  includeExts: string[];
  regression: RegressionConfig;
  maxParallel: number;
}

export function loadSettings(): HDLRunnerSettings {
  const config = vscode.workspace.getConfiguration("hdlRunner");

  const items = config.get<Record<string, ItemConfig>>("items") ?? {};
  const tests = config.get<Record<string, { plusargs: string[] }>>("tests") ?? {};
  const includeExts = config.get<string[]>("includeExts") ?? ["*.svh"];
  
  // Regression settings
  const logPatterns = config.get<LogPatterns>("logPatterns") ?? {
    error: ["ERROR", "%Error"],
    warning: ["WARNING", "%Warning"]
  };
  
  const waveform = config.get<WaveformConfig>("waveform.config") ?? {
    viewer: "gtkwave",
    viewerArgs: ["${vcd}"]
  };

  const resultsDir = config.get<string>("regression.resultsDir") ?? "out/results";

  const flatItems = flattenItems(items);

  return {
    items,
    flatItems,
    tests,
    includeExts,
    regression: {
      logPatterns,
      waveform,
      resultsDir
    },
    maxParallel: config.get<number>("maxParallel") ?? 1
  };
}

function flattenItems(
  items: Record<string, ItemConfig>,
  prefix = ""
): Record<string, ItemConfig> {
  const result: Record<string, ItemConfig> = {};

  for (const [name, item] of Object.entries(items)) {
    const fullName = prefix ? `${prefix}.${name}` : name;
    // TODO: Related to treeView.ts
    // const fullName = name;

    if (item.type === "group" && item.items) {
      Object.assign(result, flattenItems(item.items, fullName));
    } else {
      result[fullName] = item;
    }
  }

  return result;
}