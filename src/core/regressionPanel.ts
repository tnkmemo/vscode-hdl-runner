import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { HDLRunnerSettings } from "../config/settings";
import { RegressionResult, ResultCollector } from "./resultCollector";
import { WaveformLauncher } from "./waveformLauncher";
import { log } from "../ui/output";

export interface TestProgress {
  testName: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startTime?: number;
  duration?: number;
}

export class RegressionPanel {
  public static readonly viewType = "hdlRunnerRegression";
  public static instance: RegressionPanel | undefined;

  private panel: vscode.WebviewPanel;
  private currentData: RegressionResult | null = null;
  private currentProgress: TestProgress[] = [];
  private waveformLauncher: WaveformLauncher;

  private constructor(
    private context: vscode.ExtensionContext,
    private settings: HDLRunnerSettings,
    private resultCollector: ResultCollector,
    panel: vscode.WebviewPanel
  ) {
    this.panel = panel;
    this.waveformLauncher = new WaveformLauncher(settings.regression.waveform);

    // Set up webview message handler
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message),
      null,
      context.subscriptions
    );

    // Cleanup on panel closed
    this.panel.onDidDispose(
      () => {
        RegressionPanel.instance = undefined;
      },
      null,
      context.subscriptions
    );

    this.setupWebviewContent();
  }

  /**
   * Create or show the regression panel (single instance)
   */
  public static createOrShow(
    context: vscode.ExtensionContext,
    settings: HDLRunnerSettings,
    resultCollector: ResultCollector
  ): RegressionPanel {
    const column = vscode.ViewColumn.Active;

    // If instance already exists, show it
    if (RegressionPanel.instance) {
      RegressionPanel.instance.panel.reveal(column);
      return RegressionPanel.instance;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      RegressionPanel.viewType,
      "Regression Panel",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const instance = new RegressionPanel(context, settings, resultCollector, panel);
    RegressionPanel.instance = instance;

    return instance;
  }

  /**
   * Update regression results and display in panel
   */
  public updateResults(data: RegressionResult): void {
    this.currentData = data;
    this.sendDataToWebview(data);
    // Also update the dropdown list so it shows the latest results
    this.sendAllResultsToWebview();
  }

  /**
   * Update test progress
   */
  public updateProgress(testName: string, status: TestProgress["status"], duration?: number): void {
    const existing = this.currentProgress.find(p => p.testName === testName);
    if (existing) {
      existing.status = status;
      if (status === "running") {
        existing.startTime = Date.now();
      } else if (status === "success" || status === "failed") {
        existing.duration = duration || (Date.now() - (existing.startTime || 0));
      }
    } else {
      this.currentProgress.push({
        testName,
        status,
        startTime: status === "running" ? Date.now() : undefined,
        duration
      });
    }
    this.sendProgressToWebview();
  }

  /**
   * Initialize progress for multiple tests
   */
  public initializeProgress(testNames: string[]): void {
    this.currentProgress = testNames.map(testName => ({
      testName,
      status: "pending" as const
    }));
    this.sendProgressToWebview();
  }

  /**
   * Initialize results with Queued status (called when test run starts)
   */
  public initializeResults(testNames: string[]): void {
    const initialResults: RegressionResult = {
      tests: testNames.map(testName => ({
        name: testName,
        status: "queued" as const,
        errors: 0,
        warnings: 0,
        vcd: null,
        coverage: null
      })),
      timestamp: new Date().toISOString()
    };
    this.currentData = initialResults;
    this.sendDataToWebview(initialResults);
  }

  /**
   * Set up webview HTML content
   */
  private setupWebviewContent(): void {
    const resourcePath = path.join(this.context.extensionPath, "media", "regressionPanel.html");
    const fs = require("fs");
    let html = fs.readFileSync(resourcePath.toString(), "utf-8");
    this.panel.webview.html = html;
  }

  /**
   * Send regression data to webview
   */
  private sendDataToWebview(data: RegressionResult): void {
    this.panel.webview.postMessage({
      type: "regressionData",
      payload: data
    });
  }

  /**
   * Send progress data to webview
   */
  private sendProgressToWebview(): void {
    this.panel.webview.postMessage({
      type: "progressData",
      payload: this.currentProgress
    });
  }

  /**
   * Send all results metadata to webview for dropdown
   */
  private sendAllResultsToWebview(): void {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        log.warn("No workspace folder found");
        return;
      }

      const allResults = this.resultCollector.getAllResults(workspaceRoot);
      this.panel.webview.postMessage({
        type: "allResults",
        payload: allResults
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to send all results: ${message}`);
    }
  }

  /**
   * Handle messages from webview
   */
  private async handleWebviewMessage(message: any): Promise<void> {
    log.debug(`RegressionPanel received message: ${message.type}`);

    switch (message.type) {
      case "getAllResults":
        this.sendAllResultsToWebview();
        break;

      case "loadSpecificResult":
        if (message.payload && message.payload.filepath) {
          await this.loadResultFromFile(message.payload.filepath);
        }
        break;

      case "reloadResults":
        await this.loadLatestResults();
        break;

      case "openWaveform":
        if (message.payload && message.payload.vcd) {
          await this.waveformLauncher.openWaveform(message.payload.vcd);
        }
        break;

      case "viewDetails":
        if (message.payload && message.payload.testName) {
          log.info(`View details for test: ${message.payload.testName}`);
          // Phase 2: Implement details panel
        }
        break;

      case "viewLog":
        if (message.payload && message.payload.testName) {
          await this.openLogFile(message.payload.testName);
        }
        break;

      default:
        log.warn(`Unknown message type from webview: ${message.type}`);
    }
  }

  /**
   * Load latest regression results from file
   */
  private async loadLatestResults(): Promise<void> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        log.warn("No workspace folder found");
        return;
      }

      const latestFile = this.resultCollector.getLatestResultsFile(workspaceRoot);
      if (!latestFile) {
        log.info("No regression results found");
        return;
      }

      const content = fs.readFileSync(latestFile, "utf-8");
      const results = JSON.parse(content);
      
      this.updateResults(results);
      log.info(`Reloaded results from: ${latestFile}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to reload results: ${message}`);
    }
  }

  /**
   * Load a specific result from file
   */
  private async loadResultFromFile(filepath: string): Promise<void> {
    try {
      const result = this.resultCollector.loadResult(filepath);
      if (result) {
        this.updateResults(result);
        log.info(`Loaded result from: ${filepath}`);
      } else {
        log.error(`Failed to load result from: ${filepath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to load result: ${message}`);
    }
  }

  /**
   * Open log file for a test
   */
  private async openLogFile(testName: string): Promise<void> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        log.warn("No workspace folder found");
        return;
      }

      // Try to find the latest run directory
      const outDir = path.join(workspaceRoot, "out");
      if (!fs.existsSync(outDir)) {
        log.warn("No out directory found");
        return;
      }

      const runDirs = fs.readdirSync(outDir)
        .filter(dir => dir.startsWith("run_"))
        .sort()
        .reverse(); // Most recent first

      if (runDirs.length === 0) {
        log.warn("No run directories found");
        return;
      }

      const latestRunDir = path.join(outDir, runDirs[0]);
      const testLogDir = path.join(latestRunDir, "logs", testName);

      if (!fs.existsSync(testLogDir)) {
        log.warn(`Test log directory not found: ${testLogDir}`);
        vscode.window.showWarningMessage(`Log directory not found for test: ${testName}`);
        return;
      }

      const seedDirs = fs.readdirSync(testLogDir).filter(dir => dir.startsWith("seed_"));
      if (seedDirs.length === 0) {
        log.warn(`No seed directories found in: ${testLogDir}`);
        vscode.window.showWarningMessage(`No log files found for test: ${testName}`);
        return;
      }

      // Use the first seed directory
      const seedDir = seedDirs[0];
      const logPath = path.join(testLogDir, seedDir, "sim.log");

      if (fs.existsSync(logPath)) {
        const uri = vscode.Uri.file(logPath);
        await vscode.window.showTextDocument(uri);
        log.info(`Opened log file: ${logPath}`);
      } else {
        log.warn(`Log file not found: ${logPath}`);
        vscode.window.showWarningMessage(`Log file not found for test: ${testName}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to open log file: ${message}`);
    }
  }
}
