import { HDLRunnerSettings, ItemConfig } from "../config/settings";
import { ExecutionStage } from "../core/stage";
import { resultsStore } from "../core/results";
import { log } from "../ui/output";
import * as vscode from "vscode";

export interface SimulationCompleteEvent {
  fullName: string;
  testName?: string;
  testNames?: string[];  // List of all tests that were executed
  exitCode: number;
  duration: number;
  runDir?: string;
}

export class Executor {
  private simulationCompleteCallbacks: Array<
    (event: SimulationCompleteEvent) => void
  > = [];
  private progressCallbacks: Array<
    (testName: string, status: "pending" | "running" | "success" | "failed", duration?: number) => void
  > = [];
  private currentRunDir?: string;

  constructor(public settings: HDLRunnerSettings) {}

  async run(fullName: string): Promise<number> {
    const prev = resultsStore.get(fullName);
    if (prev?.status === "success") {
      log.info(`Skip: ${fullName} (already succeeded)`);
      return 0;
    }

    const item = this.settings.flatItems[fullName];

    // Execute dependsOn
    for (const dep of item.dependsOn ?? []) {
      await this.run(dep);
    }

    // Update UI
    resultsStore.setRunning(fullName);

    const stage = new ExecutionStage(fullName, item);
    const { code, duration } = await stage.run();

    // Update UI
    resultsStore.setResult(fullName, code, duration);

    // Update treeView
    vscode.commands.executeCommand("hdlRunner.refreshTree");

    return code;
  }

  /**
   * Run a single test
   */
  async runTest(testName: string): Promise<void> {
    const testNames = [testName];
    await this.runTests(testNames, "Run Test");
  }

  /**
   * Run all tests in parallel or sequentially based on maxParallel setting
   */
  async runAllTests(testNames: string[]): Promise<void> {
    await this.runTests(testNames, "Run All Tests");
  }

  /**
   * Run selected tests in parallel or sequentially
   */
  async runSelectedTests(selected: string[]): Promise<void> {
    await this.runTests(selected, "Run Selected Tests");
  }

  /**
   * Run multiple tests with parallel execution support
   */
  private async runTests(testNames: string[], operation: string): Promise<void> {
    const maxParallel = this.settings.maxParallel;
    log.info(`${operation}: ${testNames.join(", ")} (maxParallel: ${maxParallel})`);

    // Find runTest stage
    const runTestStage = Object.keys(this.settings.flatItems).find(key => key.endsWith("runTest"));
    if (!runTestStage) {
      log.error("No runTest stage found");
      return;
    }

    // Create unique run directory
    const runDir = this.createRunDirectory();
    this.currentRunDir = runDir;

    // Initialize progress
    this.progressCallbacks.forEach(callback => {
      testNames.forEach(testName => callback(testName, "pending"));
    });

    // Prepare test executions
    const testExecutions = testNames.map(testName => ({
      fullName: runTestStage,
      testName,
      item: this.settings.flatItems[runTestStage],
      runDir
    }));

    // Execute tests
    if (maxParallel === 1) {
      // Sequential execution
      for (const exec of testExecutions) {
        await this.executeTest(exec);
      }
    } else {
      // Parallel execution with limit
      const chunks = this.chunkArray(testExecutions, maxParallel);
      for (const chunk of chunks) {
        await Promise.all(chunk.map(exec => this.executeTest(exec)));
      }
    }

    // Fire completion event for all tests
    this.simulationCompleteCallbacks.forEach((callback) => {
      callback({
        fullName: runTestStage,
        testName: undefined, // undefined means all tests completed
        testNames: testNames,  // List of tests that were executed
        exitCode: 0, // TODO: determine overall exit code
        duration: 0, // TODO: calculate total duration
        runDir: runDir
      });
    });

    log.info(`${operation} completed`);
  }

  /**
   * Create unique run directory
   */
  private createRunDirectory(): string {
    const now = new Date();
    const dateStr = now.getFullYear().toString().slice(-2) +
                    (now.getMonth() + 1).toString().padStart(2, '0') +
                    now.getDate().toString().padStart(2, '0') +
                    now.getHours().toString().padStart(2, '0') +
                    now.getMinutes().toString().padStart(2, '0') +
                    now.getSeconds().toString().padStart(2, '0');

    const fs = require("fs");
    const path = require("path");
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      throw new Error("No workspace folder found");
    }

    let uniqueId = 0;
    let runDir: string;
    do {
      runDir = path.join(workspaceRoot, "out", `run_${dateStr}_${uniqueId}`);
      uniqueId++;
    } while (fs.existsSync(runDir));

    return runDir;
  }

  /**
   * Run a single test execution (internal use)
   */
  private async executeTest(exec: { fullName: string; testName: string; item: ItemConfig; runDir: string }): Promise<void> {
    const { fullName, testName, item, runDir } = exec;

    // Notify progress: running
    this.progressCallbacks.forEach(callback => callback(testName, "running"));

    // Execute dependsOn
    for (const dep of item.dependsOn ?? []) {
      await this.run(dep);
    }

    // Apply test config
    const effectiveConfig = this.applyTestConfig(item, testName);

    // Create execution stage with custom log path
    const stage = new ExecutionStage(fullName, effectiveConfig, testName, runDir);

    // Update UI
    resultsStore.setRunning(`${fullName}.${testName}`);

    const { code, duration } = await stage.run();

    // Update UI
    if (code === 0) {
      this.progressCallbacks.forEach(callback => callback(testName, "success", duration));
    } else {
      this.progressCallbacks.forEach(callback => callback(testName, "failed", duration));
    }
    resultsStore.setResult(`${fullName}.${testName}`, code, duration);

    // Change status Queued to Pass/Fail
    this.simulationCompleteCallbacks.forEach((callback) => {
      callback({
        fullName: fullName,
        testName: testName,
        testNames: [testName], 
        exitCode: code,
        duration: duration,
        runDir: runDir!
      });
    });

    // Refresh tree
    vscode.commands.executeCommand("hdlRunner.refreshTree");

    // Note: Completion event is fired by runTests method for all tests at once
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Register callback for simulation completion
   */
  onSimulationComplete(
    callback: (event: SimulationCompleteEvent) => void
  ): void {
    this.simulationCompleteCallbacks.push(callback);
  }

  /**
   * Register callback for progress updates
   */
  onProgressUpdate(
    callback: (testName: string, status: "pending" | "running" | "success" | "failed", duration?: number) => void
  ): void {
    this.progressCallbacks.push(callback);
  }

  private applyTestConfig(config: ItemConfig, testName: string): ItemConfig {
    const test = this.settings.tests[testName];
    if (!test) return config;

    const plusargs = [...test.plusargs];
    if (test.seed !== undefined) {
      plusargs.push(`+SEED=${test.seed}`);
    }

    return {
      ...config,
      command: `${config.command} ${plusargs.join(" ")}`
    };
  }
}