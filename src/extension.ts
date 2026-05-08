import * as vscode from "vscode";
import { loadSettings } from "./config/settings";
import { Executor } from "./core/executor";
import { resultsStore } from "./core/results";
import { watcherManager } from "./core/watcher";
import { HDLRunnerTreeView } from "./ui/treeView";
import { log } from "./ui/output";
import { RegressionPanel } from "./core/regressionPanel";
import { ResultCollector } from "./core/resultCollector";
import { WaveformLauncher } from "./core/waveformLauncher";

export function activate(context: vscode.ExtensionContext) {
  let settings = loadSettings();
  const treeView = new HDLRunnerTreeView(settings);
  const executor = new Executor(settings);
  const resultCollector = new ResultCollector(settings.regression);

  // Watchers
  const watcher = new watcherManager(settings, treeView);
  watcher.activate();

  // Register simulation completion handler
  executor.onSimulationComplete(async (event) => {
    try {
      // Collect test results
      const allTestNames = Object.keys(settings.tests);
      const plannedTestNames = event.testNames || (event.testName ? [event.testName] : []);
      
      const runDir = event.runDir;
      if (!runDir) {
        log.error("No run directory specified for result collection");
        return;
      }

      const results = resultCollector.collectResults(allTestNames, plannedTestNames, runDir);

      // Save results to JSON
      const filepath = resultCollector.saveResults(results, runDir);
      log.info(`Regression results saved: ${filepath}`);

      // Update or create regression panel
      const panel = RegressionPanel.createOrShow(context, settings, resultCollector);
      panel.updateResults(results);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to process simulation results: ${message}`);
    }
  });

  // Register progress update handler
  executor.onProgressUpdate((testName, status, duration) => {
    const panel = RegressionPanel.instance;
    if (panel) {
      panel.updateProgress(testName, status, duration);
    }
  });

  vscode.window.registerTreeDataProvider("hdlRunnerView", treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand("hdlRunner.runItem", async (fullName: string) => {
      const item = settings.flatItems[fullName];

      if (!item) {
        log.error(`Unknown item: ${fullName}`);
        return;
      }

      // Handle reserved words
      if (fullName.endsWith("runAllTest")) {
        await vscode.commands.executeCommand("hdlRunner.runAllTests");
        return;
      }
      if (fullName.endsWith("runSelectedTest")) {
        await vscode.commands.executeCommand("hdlRunner.runSelectedTests");
        return;
      }
      if (fullName.endsWith("runTest")) {
        await vscode.commands.executeCommand("hdlRunner.runTest");
        return;
      }

      if (item.type !== "group") {
        executor.run(fullName);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hdlRunner.runTest", async () => {
      const testNames = Object.keys(settings.tests);
      if (testNames.length === 0) {
        log.warn("No tests configured");
        return;
      }

      const selected = await vscode.window.showQuickPick(testNames, {
        placeHolder: "Select a test to run"
      });

      if (!selected) {
        return;
      }

      // Initialize progress in panel
      const panel = RegressionPanel.createOrShow(context, settings, resultCollector);
      panel.initializeProgress([selected]);
      panel.initializeResults([selected]);

      await executor.runTest(selected);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hdlRunner.runAllTests", async () => {
      const testNames = Object.keys(settings.tests);
      if (testNames.length === 0) {
        log.warn("No tests configured");
        return;
      }

      // Initialize progress in panel
      const panel = RegressionPanel.createOrShow(context, settings, resultCollector);
      panel.initializeProgress(testNames);
      panel.initializeResults(testNames);

      await executor.runAllTests(testNames);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hdlRunner.runSelectedTests", async () => {
      const testNames = Object.keys(settings.tests);
      if (testNames.length === 0) {
        log.warn("No tests configured");
        return;
      }

      const selected = await vscode.window.showQuickPick(testNames, {
        canPickMany: true,
        placeHolder: "Select tests to run"
      });

      if (!selected || selected.length === 0) {
        return;
      }

      // Initialize progress in panel
      const panel = RegressionPanel.createOrShow(context, settings, resultCollector);
      panel.initializeProgress(selected);
      panel.initializeResults(selected);

      await executor.runSelectedTests(selected);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hdlRunner.refreshTree", () => {
      treeView.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hdlRunner.resetItem", (node) => {
      resultsStore.reset(node.fullName);
      treeView.refresh();
      log.info(`Reset: ${node.fullName}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hdlRunner.openRegressionPanel", async () => {
      const panel = RegressionPanel.createOrShow(context, settings, resultCollector);

      // Try to load and display latest results
      try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
          const latestFile = resultCollector.getLatestResultsFile(workspaceRoot);
          if (latestFile) {
            const fs = require("fs");
            const content = fs.readFileSync(latestFile, "utf-8");
            const results = JSON.parse(content);
            panel.updateResults(results);
            log.info(`Loaded results from: ${latestFile}`);
          } else {
            log.info("No regression results found. Run simulations first.");
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to load results: ${message}`);
      }
    })
  );

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("hdlRunner")) {
      settings = loadSettings();

      treeView.settings = settings;
      executor.settings = settings;

      // Reset all stages when settings change
      resultsStore.resetAll(Object.keys(settings.flatItems));
      
      treeView.refresh();
      log.info("settings.json reloaded.");

      // Update watchers
      watcher.update(settings, treeView);
      watcher.activate();
    }
  });
}