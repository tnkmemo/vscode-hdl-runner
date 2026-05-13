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

export interface GoalLineConfig {
  startDate: string;
  endDate: string;
  startValue: number;
  endValue: number;
}

export interface RegressionConfig {
  logPatterns: LogPatterns;
  waveform: WaveformConfig;
  goalLine?: GoalLineConfig;
}

export interface HDLRunnerSettings {
  items: Record<string, ItemConfig>;
  flatItems: Record<string, ItemConfig>;
  tests: Record<string, { plusargs: string[]; seed?: number }>;
  includeExts: string[];
  regression: RegressionConfig;
  maxParallel: number;
  filelistPath: string;
}

export function loadSettings(): HDLRunnerSettings {
  const config = vscode.workspace.getConfiguration("hdlRunner");

  const items = config.get<Record<string, ItemConfig>>("items") ?? {};
  const flatItems = flattenItems(items);

  return {
    items,
    flatItems,
    tests: config.get<Record<string, { plusargs: string[] }>>("tests") ?? {},
    includeExts: config.get<string[]>("includeExts") ?? ["*.svh"],
    regression: {
      logPatterns:config.get<LogPatterns>("logPatterns") ?? {
        error: ["ERROR", "%Error"],
        warning: ["WARNING", "%Warning"]
      },
      waveform: config.get<WaveformConfig>("waveform.config") ?? {
        viewer: "gtkwave",
        viewerArgs: ["${vcd}"]
      },
      goalLine: config.get<GoalLineConfig>("regression.goalLine")
    },
    maxParallel: config.get<number>("maxParallel") ?? 1,
    filelistPath: config.get<string>("filelistPath") ?? "filelist.f"
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