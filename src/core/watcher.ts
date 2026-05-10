import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { resultsStore } from "../core/results";
import { HDLRunnerTreeView } from "../ui/treeView";
import { HDLRunnerSettings } from "../config/settings";
import { log } from "../ui/output";

export class watcherManager {
  private filelistWatchers: vscode.FileSystemWatcher[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];

  constructor(
    private settings: HDLRunnerSettings,
    private treeView: HDLRunnerTreeView
  ) {}

  activate () {
    // Start or change settings.json
    this.watchFilelistDeps();

    // File change
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (wsRoot) {
      const relativePath = this.settings.filelistPath;
      const fullPath = path.isAbsolute(relativePath) 
        ? relativePath 
        : path.join(wsRoot, relativePath);

      if (fs.existsSync(fullPath)) {
        this.watchFileDeps(fullPath);
        log.info(`${relativePath} loaded.`);
      } else {
        log.warn(`Configured filelist not found: ${fullPath}`);
      }
    }
  }

  update (
    settings: HDLRunnerSettings,
    treeView: HDLRunnerTreeView
  ) {
    // Update configs
    this.settings = settings;
    this.treeView = treeView;

    // dispose watchers
    for (const w of this.filelistWatchers) w.dispose();
    for (const w of this.fileWatchers) w.dispose();
    this.filelistWatchers = [];
    this.fileWatchers = [];
  }

  watchFilelistDeps() {
      // Initialize
      for (let w of this.filelistWatchers) {
        w.dispose();
      }
      this.filelistWatchers = [];

      // Create and watch
      const target = this.settings.filelistPath;
      let watcher = vscode.workspace.createFileSystemWatcher(`**/${target}`);

      watcher.onDidChange((uri) => {
        this.resetAllStages(`${target} is changed.`);
        this.watchFileDeps(uri.fsPath);
      });
      watcher.onDidCreate(() => this.resetAllStages(`${target} created`));

      // Register
      this.filelistWatchers.push(watcher);
  }

  watchFileDeps(filelistPath: string) {
    // Dispose all watcher
    for (let w of this.fileWatchers) {
      w.dispose();
    }
    this.fileWatchers = [];

    let { files, incdirs } = this.parseFilelist(filelistPath);
    let wsRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

    // Watch source files in filelist.f
    for (let f of files) {
      let abs = path.join(wsRoot, f);
      let watcher = vscode.workspace.createFileSystemWatcher(abs);

      watcher.onDidCreate(() => this.resetAllStages(`created: ${abs}`));
      watcher.onDidChange(() => this.resetAllStages(`changed: ${abs}`));
      watcher.onDidDelete(() => this.resetAllStages(`deleted: ${abs}`));

      this.fileWatchers.push(watcher);
    }

    // Watch source files in incdir in filelist.f
    for (let dir of incdirs) {
      let absDir = path.join(wsRoot, dir);

      for (let ext of this.settings.includeExts) {
        let pattern = path.join(absDir, ext);
        let watcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidCreate(() => this.resetAllStages(`created: ${pattern}`));
        watcher.onDidChange(() => this.resetAllStages(`changed: ${pattern}`));
        watcher.onDidDelete(() => this.resetAllStages(`deleted: ${pattern}`));

        this.fileWatchers.push(watcher);
      }
    }
  }

  parseFilelist(filelistPath: string): {
    files: string[];
    incdirs: string[];
  } {
    const text = fs.readFileSync(filelistPath, "utf8");
    const lines = text.split(/\r?\n/);

    const files: string[] = [];
    const incdirs: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      if (trimmed.startsWith("+incdir+")) {
          const dir = trimmed.replace("+incdir+", "");
          incdirs.push(dir);
      } else {
          files.push(trimmed);
      }
    }

    return { files, incdirs };
  }

  resetAllStages(reason: string) {
    const names = Object.keys(this.settings.flatItems);
    resultsStore.resetAll(names);
    this.treeView.refresh();
    log.info(`Stage reset triggered: ${reason}`);
  }
}