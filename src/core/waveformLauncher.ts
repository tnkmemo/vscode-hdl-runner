import { spawn } from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { WaveformConfig } from "../config/settings";
import { log } from "../ui/output";

export class WaveformLauncher {
  constructor(private config: WaveformConfig) {}

  /**
   * Open VCD file with configured waveform viewer
   * @param vcdPath Path to VCD file
   */
  async openWaveform(vcdPath: string): Promise<void> {
    try {
      // Resolve VCD path (relative to workspace or absolute)
      const resolvedPath = this.resolveVcdPath(vcdPath);

      if (!resolvedPath) {
        log.error(`VCD file not found: ${vcdPath}`);
        vscode.window.showErrorMessage(`VCD file not found: ${vcdPath}`);
        return;
      }

      // Prepare command and arguments
      const command = this.config.viewer;
      const args = this.config.viewerArgs.map((arg) =>
        arg.replace("${vcd}", resolvedPath)
      );

      log.info(
        `Opening waveform: ${command} ${args.join(" ")}`
      );

      // Launch viewer
      const proc = spawn(command, args, {
        detached: true,
        stdio: "ignore"
      });

      // Don't wait for the process to exit
      proc.unref();

      vscode.window.showInformationMessage(
        `Opening waveform: ${path.basename(resolvedPath)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to open waveform: ${message}`);
      vscode.window.showErrorMessage(
        `Failed to open waveform viewer: ${message}`
      );
    }
  }

  /**
   * Resolve VCD file path
   * @param vcdPath Relative or absolute path
   * @returns Resolved absolute path, or null if file doesn't exist
   */
  private resolveVcdPath(vcdPath: string): string | null {
    // If already absolute, check if it exists
    if (path.isAbsolute(vcdPath)) {
      return vcdPath;
    }

    // Try relative to workspace root
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const resolvedPath = path.join(workspaceRoot, vcdPath);
      return resolvedPath;
    }

    return vcdPath;
  }
}
