import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { ItemConfig } from "../config/settings";
import { output, log } from "../ui/output";

export class ExecutionStage {
  constructor(
    public readonly name: string,
    public readonly config: ItemConfig,
    public readonly testName?: string,
    public readonly runDir?: string
  ) {}

  async run(): Promise<{ code: number; duration: number }> {
    return new Promise((resolve) => {
      if (!this.config.command) {
        log.error(`No command defined for: ${this.name}`);
        return resolve({ code: -1, duration: 0 });
      }

      const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!cwd) {
        log.error("No workspace folder found.");
        return resolve({ code: -1, duration: 0 });
      }

      log.info(`Stage: ${this.name}${this.testName ? ` (${this.testName})` : ""}`);

      // Get seed from command line for placeholder replacement
      const seedMatch = this.config.command.match(/\+SEED=(\d+)/);
      const seed = seedMatch ? seedMatch[1] : "0";

      // Replace path placeholders in command with actual run directory paths
      const command = this.replacePathPlaceholders(this.config.command, seed);
      log.info(`Command = ${command}`);

      const [cmd, ...args] = command.split(" ");

      const start = Date.now();

      const proc = cp.spawn(cmd, args, {
        cwd,
        env: process.env,
        shell: true
      });

      // Handle output based on testName
      if (this.testName && this.runDir) {
        // Extract seed value
        const seedMatch = this.config.command.match(/\+SEED=(\d+)/);
        const seed = seedMatch ? seedMatch[1] : "0";

        // Create directories (logs, works, waves, covs)
        ["logs", "works", "waves", "covs"].forEach(dirType => {
            const targetPath = path.join(this.runDir!, dirType, this.testName!, `seed_${seed}`);
            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(targetPath, { recursive: true });
            }
        });

        // Create test-specific directories
        const testLogDir = path.join(this.runDir, "logs", this.testName, `seed_${seed}`);
        const logFile = path.join(testLogDir, "sim.log");

        const logStream = fs.createWriteStream(logFile, { flags: "w" });

        proc.stdout.on("data", (data) => {
          const str = data.toString();
          output.append(str);
          logStream.write(str);
        });
        proc.stderr.on("data", (data) => {
          const str = data.toString();
          output.append(str);
          logStream.write(str);
        });

        proc.on("close", () => logStream.end());
      } else {
        proc.stdout.on("data", (data) => output.append(data.toString()));
        proc.stderr.on("data", (data) => output.append(data.toString()));
      }

      proc.on("close", (code) => {
        const duration = Date.now() - start;
        resolve({ code: code ?? -1, duration });
      });

      proc.on("error", (err) => {
        log.error(`Failed to start process: ${err.message}`);
        resolve({ code: -1, duration: 0 });
      });
    });
  }

  /**
   * Replace path placeholders in command with actual run directory paths
   * Supported placeholders: ${logs}, ${works}, ${waves}, ${covs}, ${results}
   * If testName is set, paths include testName and seed subdirectories
   */
  private replacePathPlaceholders(command: string, seed: string): string {
    if (!this.runDir) return command;

    const pathDirs = ["logs", "works", "waves", "covs", "results"];
    let result = command;

    pathDirs.forEach(dir => {
      const placeholder = `\${${dir}}`;
      // Build path including testName and seed subdirectories if testName is set
      let actualPath = path.join(this.runDir!, dir);
      if (this.testName) {
        actualPath = path.join(actualPath, this.testName, `seed_${seed}`);
      }
      // Escape special regex characters in the placeholder
      const escapedPlaceholder = placeholder.replace(/[\$\{\}]/g, "\\$&");
      result = result.replace(new RegExp(escapedPlaceholder, "g"), actualPath);
    });

    return result;
  }
}