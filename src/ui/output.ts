import * as vscode from "vscode";

export const output = vscode.window.createOutputChannel("HDL Runner");

export const log = {
  info(msg: string) {
    output.appendLine(`[INFO] ${msg}`);
  },
  warn(msg: string) {
    output.appendLine(`[WARN] ${msg}`);
  },
  error(msg: string) {
    output.appendLine(`[ERROR] ${msg}`);
    output.show();
  },
  debug(msg: string) {
    output.appendLine(`[DEBUG] ${msg}`);
  }
};