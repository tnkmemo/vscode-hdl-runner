import * as vscode from "vscode";
import { HDLRunnerSettings, ItemConfig } from "../config/settings";
import { resultsStore } from "../core/results";

export class ItemNode extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly item: ItemConfig,
    public readonly fullName: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(name, collapsibleState);

    if (item.type === "group") {
      this.contextValue = "group";
    } else {
      this.command = {
        command: "hdlRunner.runItem",
        title: "Run",
        arguments: [fullName]
      };
      this.contextValue = item.type;
    }

    const result = resultsStore.get(fullName);

    this.iconPath = item.type === "group" ? undefined : this.getIcon(result?.status);

    if (result?.status === "running") {
      this.label = `${name} (running…)`;
    } else if (result?.durationMs !== undefined) {
      const sec = (result.durationMs / 1000).toFixed(2);
      this.label = `${name} (${sec}s)`;
    } else {
      this.label = name;
    }
  }

  private getIcon(status?: string): vscode.ThemeIcon {
    switch (status) {
      case "running":
        return new vscode.ThemeIcon("sync~spin");
      case "success":
        return new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
      case "failed":
        return new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
      default:
        return new vscode.ThemeIcon("circle-outline");
    }
  }
}

export class HDLRunnerTreeView implements vscode.TreeDataProvider<ItemNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ItemNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(public settings: HDLRunnerSettings) {}

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ItemNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ItemNode): ItemNode[] {
    if (!element) {
      return this.buildNodes(this.settings.items, "");
    }

    if (element.item.type === "group" && element.item.items) {
      return this.buildNodes(element.item.items, element.fullName);
    }

    return [];
  }

  private buildNodes(
    items: Record<string, ItemConfig>,
    prefix: string
  ): ItemNode[] {
    return Object.entries(items).map(([name, item]) => {
      const fullName = prefix ? `${prefix}.${name}` : name;

      const collapsible =
        item.type === "group"
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;

      return new ItemNode(name, item, fullName, collapsible);
    });
  }
}