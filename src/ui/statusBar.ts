import * as vscode from "vscode";

class StatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.text = "$(circuit-board) hdlRunner: Idle";
    this.item.show();
  }

  showIdle() {
    this.item.text = "$(circuit-board) hdlRunner: Idle";
    this.item.tooltip = "SystemVerilog Simulation Framework";
  }

  showRunning(name: string) {
    this.item.text = `$(sync~spin) hdlRunner: Running ${name}…`;
    this.item.tooltip = `Running stage: ${name}`;
  }

  showSuccess(name: string) {
    this.item.text = `$(check) hdlRunner: ${name} OK`;
    this.item.tooltip = `Last succeeded: ${name}`;
  }

  showFailed(name: string) {
    this.item.text = `$(error) hdlRunner: ${name} Failed`;
    this.item.tooltip = `Last failed: ${name}`;
  }
}

export const statusBar = new StatusBar();