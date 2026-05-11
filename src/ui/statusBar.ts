import * as vscode from "vscode";

class StatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.text = "hdlRunner: Disable";
    this.item.show();
  }

  showEnable() {
    this.item.text = "hdlRunner: Enable";
    this.item.tooltip = "HDL Runner Enable";
  }

  showDisable() {
    this.item.text = "hdlRunner: Disable";
    this.item.tooltip = "HDL Runner Disable";
  }
}

export const statusBar = new StatusBar();