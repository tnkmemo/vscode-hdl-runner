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

class HDLRunnerController {
    private subscriptions: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext) {}

    public activate() {
      if (this.subscriptions.length > 0) {
          vscode.window.showInformationMessage("HDL Runner is already active.");
          return;
      }

      let settings = loadSettings();
      const treeView = new HDLRunnerTreeView(settings);
      const executor = new Executor(settings);
      const resultCollector = new ResultCollector(settings.regression);
      const watcher = new watcherManager(settings, treeView);

      // Enable commands
      vscode.commands.executeCommand('setContext', 'hdlRunnerEnabled', true);

      // registerTreeDataProvider
      this.subscriptions.push(
        vscode.window.registerTreeDataProvider("hdlRunnerView", treeView)
      );

      // onDidChangeConfiguration
      this.subscriptions.push(
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
        })
      );

      // executor
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
          const panel = RegressionPanel.createOrShow(this.context, settings, resultCollector);
          panel.updateResults(results);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log.error(`Failed to process simulation results: ${message}`);
        }
      }),

      // Register progress update handler
      executor.onProgressUpdate((testName, status, duration) => {
        const panel = RegressionPanel.instance;
        if (panel) {
          panel.updateProgress(testName, status, duration);
        }
      });

      // registerCommand
      this.subscriptions.push(
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
        }),

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
          const panel = RegressionPanel.createOrShow(this.context, settings, resultCollector);
          panel.initializeProgress([selected]);
          panel.initializeResults([selected]);

          await executor.runTest(selected);
        }),

        vscode.commands.registerCommand("hdlRunner.runAllTests", async () => {
          const testNames = Object.keys(settings.tests);
          if (testNames.length === 0) {
            log.warn("No tests configured");
            return;
          }

          // Initialize progress in panel
          const panel = RegressionPanel.createOrShow(this.context, settings, resultCollector);
          panel.initializeProgress(testNames);
          panel.initializeResults(testNames);

          await executor.runAllTests(testNames);
        }),

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
          const panel = RegressionPanel.createOrShow(this.context, settings, resultCollector);
          panel.initializeProgress(selected);
          panel.initializeResults(selected);

          await executor.runSelectedTests(selected);
        }),

        vscode.commands.registerCommand("hdlRunner.refreshTree", () => {
          treeView.refresh();
        }),

        vscode.commands.registerCommand("hdlRunner.resetItem", (node) => {
          resultsStore.reset(node.fullName);
          treeView.refresh();
          log.info(`Reset: ${node.fullName}`);
        }),

        vscode.commands.registerCommand("hdlRunner.openRegressionPanel", async () => {
          const panel = RegressionPanel.createOrShow(this.context, settings, resultCollector);

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

      watcher.activate();

      log.info("HDL Runner has been activated.");
      vscode.window.showInformationMessage("HDL Runner: Activated.");
    }

    public deactivate() {
      this.subscriptions.forEach(s => s.dispose());
      this.subscriptions = [];

      // Disable commands
      vscode.commands.executeCommand('setContext', 'hdlRunnerEnabled', false);

      log.info("HDL Runner has been deactivated.");
      vscode.window.showInformationMessage("HDL Runner: Deactivated.");
    }
}

export function activate(context: vscode.ExtensionContext) {
  const controller = new HDLRunnerController(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("hdlRunner.enable", () => {
        controller.activate();
    }),
    vscode.commands.registerCommand("hdlRunner.disable", () => {
        controller.deactivate();
    })
  );
}

export function deactivate() {}
